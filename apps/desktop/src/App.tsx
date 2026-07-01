import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { adaptCodexPet } from "@ai-pets/codex-pet-adapter";
import { validatePetPackage, type PetPackage } from "@ai-pets/pet-protocol";
import {
  getAnimationDurationMs,
  getCurrentFrame,
  listRenderableStates,
  resolveInteractionState,
  type RenderableState,
  type SpriteFrame
} from "@ai-pets/pet-renderer";
import { petCatalog, type PetCatalogItem } from "./petCatalog";

type LoadState = "idle" | "loading" | "ready" | "error";

interface DragSnapshot {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  startWindowX: number;
  startWindowY: number;
  moved: boolean;
}

declare global {
  interface Window {
    aiPetsDesktop?: {
      getWindowPosition(): Promise<{ x: number; y: number }>;
      moveWindow(position: { x: number; y: number }): Promise<void>;
      setSettingsOpen(open: boolean): Promise<void>;
      showContextMenu(): Promise<void>;
      onToggleSettings(callback: () => void): () => void;
      onSetSettingsOpen(callback: (open: boolean) => void): () => void;
    };
  }
}

const defaultMessage = "你好，我是 AI 宠物。";

function joinAssetUrl(selected: PetCatalogItem, pkg: PetPackage) {
  return `${selected.assetBaseUrl}${pkg.assets.atlas.path}`;
}

function getValidationMessage(pkg: unknown) {
  const result = validatePetPackage(pkg);
  return result.ok ? "" : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
}

function findIdleStateId(states: RenderableState[]) {
  return states.find((state) => state.semanticRole === "idle")?.id ?? states[0]?.id ?? "";
}

function clampPlaybackSpeed(value: number) {
  return Number.isFinite(value) ? Math.max(0.5, Math.min(1.5, value)) : 1;
}

export function App() {
  const [selectedId, setSelectedId] = useState(petCatalog[1]?.id ?? petCatalog[0]?.id ?? "");
  const [pkg, setPkg] = useState<PetPackage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [activeState, setActiveState] = useState("");
  const [message, setMessage] = useState(defaultMessage);
  const [elapsed, setElapsed] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dragRef = useRef<DragSnapshot | null>(null);

  const selected = petCatalog.find((item) => item.id === selectedId);
  const states = useMemo(() => (pkg ? listRenderableStates(pkg) : []), [pkg]);
  const activeRenderableState = states.find((state) => state.id === activeState);
  const effectiveElapsed = elapsed * playbackSpeed;

  const frame = useMemo<SpriteFrame | null>(() => {
    if (!pkg || !activeState) {
      return null;
    }

    try {
      return getCurrentFrame(pkg, activeState, effectiveElapsed);
    } catch {
      return null;
    }
  }, [activeState, effectiveElapsed, pkg]);

  function switchState(nextStateId: string) {
    setElapsed(0);
    setActiveState(nextStateId);
  }

  function updatePlaybackSpeed(value: number) {
    setPlaybackSpeed(clampPlaybackSpeed(value));
  }

  function toggleSettings(nextOpen = !settingsOpen) {
    setSettingsOpen(nextOpen);
    void window.aiPetsDesktop?.setSettingsOpen(nextOpen);
  }

  useEffect(() => {
    const removeToggleListener = window.aiPetsDesktop?.onToggleSettings(() => {
      setSettingsOpen((current) => {
        const nextOpen = !current;
        void window.aiPetsDesktop?.setSettingsOpen(nextOpen);
        return nextOpen;
      });
    });
    const removeSetListener = window.aiPetsDesktop?.onSetSettingsOpen((open) => {
      setSettingsOpen(open);
    });

    return () => {
      removeToggleListener?.();
      removeSetListener?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPet() {
      if (!selected) {
        setLoadState("error");
        setError("宠物目录为空。");
        return;
      }

      setLoadState("loading");
      setError("");
      setPkg(null);
      setActiveState("");

      try {
        const response = await fetch(selected.manifestUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}：无法读取 ${selected.manifestUrl}`);
        }

        const raw: unknown = await response.json();
        const nextPkg = selected.sourceType === "codex-pet" ? adaptCodexPet(raw) : raw;
        const validationMessage = getValidationMessage(nextPkg);
        if (validationMessage) {
          throw new Error(validationMessage);
        }

        if (!cancelled) {
          const typedPackage = nextPkg as PetPackage;
          const firstState = listRenderableStates(typedPackage)[0]?.id ?? "";
          setPkg(typedPackage);
          switchState(firstState);
          setMessage(defaultMessage);
          setLoadState("ready");
        }
      } catch (caught) {
        if (!cancelled) {
          setLoadState("error");
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    }

    void loadPet();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    setElapsed(0);
    const started = performance.now();
    let raf = 0;

    const tick = () => {
      setElapsed(performance.now() - started);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeState]);

  useEffect(() => {
    if (!pkg || !activeState || playbackSpeed <= 0) {
      return;
    }

    const state = pkg.states[activeState];
    if (!state || state.loop) {
      return;
    }

    const idleStateId = findIdleStateId(states);
    const animation = pkg.animationSets.default.animations[state.animation];
    if (!idleStateId || idleStateId === activeState || !animation) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setElapsed(0);
      setActiveState((currentState) => (currentState === activeState ? idleStateId : currentState));
    }, getAnimationDurationMs(animation) / playbackSpeed);

    return () => window.clearTimeout(timeout);
  }, [activeState, pkg, playbackSpeed, states]);

  function triggerInteraction(interactionId: string) {
    if (!pkg) {
      return;
    }

    const nextState = resolveInteractionState(pkg, interactionId);
    if (nextState) {
      switchState(nextState.id);
    }

    const say = pkg.interactions[interactionId]?.say;
    if (say) {
      setMessage(say);
    }
  }

  async function startDrag(event: ReactPointerEvent) {
    if (event.button !== 0 || !window.aiPetsDesktop) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const position = await window.aiPetsDesktop.getWindowPosition();
    dragRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startWindowX: position.x,
      startWindowY: position.y,
      moved: false
    };
  }

  function moveDrag(event: ReactPointerEvent) {
    const snapshot = dragRef.current;
    if (!snapshot || snapshot.pointerId !== event.pointerId || !window.aiPetsDesktop) {
      return;
    }

    const deltaX = event.screenX - snapshot.startScreenX;
    const deltaY = event.screenY - snapshot.startScreenY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      snapshot.moved = true;
    }

    void window.aiPetsDesktop.moveWindow({
      x: Math.round(snapshot.startWindowX + deltaX),
      y: Math.round(snapshot.startWindowY + deltaY)
    });
  }

  function endDrag(event: ReactPointerEvent) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function openContextMenu(event: ReactMouseEvent) {
    event.preventDefault();
    void window.aiPetsDesktop?.showContextMenu();
  }

  const spriteStyle: CSSProperties | undefined =
    pkg && selected && frame
      ? {
          width: pkg.assets.atlas.cellWidth,
          height: pkg.assets.atlas.cellHeight,
          backgroundImage: `url(${joinAssetUrl(selected, pkg)})`,
          backgroundPosition: `-${frame.x}px -${frame.y}px`
        }
      : undefined;

  return (
    <main className={`desktop-app${settingsOpen ? " settings-open" : ""}`} onContextMenu={openContextMenu}>
      <section className="pet-zone">
        {loadState === "loading" && <div className="notice">正在加载宠物...</div>}
        {loadState === "error" && <div className="notice error">{error}</div>}
        {loadState === "ready" && pkg && frame && selected && (
          <div className="pet-shell">
            <div className="speech">{message}</div>
            <button
              aria-label={`${pkg.displayName} 当前状态：${activeRenderableState?.label ?? activeState}`}
              className="sprite-button"
              onClick={() => triggerInteraction("click")}
              onPointerCancel={endDrag}
              onPointerDown={(event) => void startDrag(event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              style={spriteStyle}
              title="左键拖拽移动，右键打开设置"
              type="button"
            />
          </div>
        )}
      </section>

      {settingsOpen && (
        <aside className="settings-panel">
          <div className="panel-title">
            <strong>AI-Pets 设置</strong>
            <button onClick={() => toggleSettings(false)} type="button">
              关闭
            </button>
          </div>

          <label className="field">
            <span>宠物包</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {petCatalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <section className="group">
            <h2>动作</h2>
            <div className="button-grid">
              {states.map((state) => (
                <button
                  className={state.id === activeState ? "active" : ""}
                  key={state.id}
                  onClick={() => switchState(state.id)}
                  type="button"
                >
                  {state.label}
                </button>
              ))}
            </div>
          </section>

          <section className="group">
            <h2>AI 事件</h2>
            <div className="button-grid">
              {pkg &&
                Object.keys(pkg.interactions).map((interactionId) => (
                  <button key={interactionId} onClick={() => triggerInteraction(interactionId)} type="button">
                    {interactionId}
                  </button>
                ))}
            </div>
          </section>

          <label className="field">
            <span>播放速度 {playbackSpeed.toFixed(2)}x</span>
            <input
              max="1.5"
              min="0.5"
              onChange={(event) => updatePlaybackSpeed(Number(event.target.value))}
              step="0.05"
              type="range"
              value={playbackSpeed}
            />
          </label>
        </aside>
      )}
    </main>
  );
}
