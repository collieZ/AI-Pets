import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
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
type SettingsTab = "basic" | "packages" | "testing";

interface DragSnapshot {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  startWindowX: number;
  startWindowY: number;
  moved: boolean;
}

interface DesktopState {
  settingsOpen: boolean;
  petVisible: boolean;
  alwaysOnTop: boolean;
}

type PetCommand =
  | { type: "selectPet"; selectedId: string }
  | { type: "state"; stateId: string }
  | { type: "interaction"; interactionId: string }
  | { type: "say"; message: string }
  | { type: "playbackSpeed"; value: number }
  | { type: "idle" };

declare global {
  interface Window {
    aiPetsDesktop?: {
      getWindowPosition(): Promise<{ x: number; y: number }>;
      moveWindow(position: { x: number; y: number }): Promise<void>;
      setSettingsOpen(open: boolean): Promise<void>;
      setPetVisible(visible: boolean): Promise<void>;
      setAlwaysOnTop(enabled: boolean): Promise<void>;
      getDesktopState(): Promise<DesktopState>;
      dispatchPetCommand(command: PetCommand): Promise<void>;
      showContextMenu(): Promise<void>;
      onDesktopState(callback: (state: DesktopState) => void): () => void;
      onPetCommand(callback: (command: PetCommand) => void): () => void;
    };
  }
}

const defaultMessage = "你好，我是 AI 宠物。";
const defaultDesktopState: DesktopState = {
  settingsOpen: false,
  petVisible: true,
  alwaysOnTop: true
};

function getInitialPetId() {
  return petCatalog[1]?.id ?? petCatalog[0]?.id ?? "";
}

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

function findMovementState(states: RenderableState[], deltaX: number) {
  const role = deltaX >= 0 ? "moveRight" : "moveLeft";
  return states.find((state) => state.semanticRole === role);
}

function clampPlaybackSpeed(value: number) {
  return Number.isFinite(value) ? Math.max(0.5, Math.min(1.5, value)) : 1;
}

function getViewMode() {
  return new URLSearchParams(window.location.search).get("view") === "settings" ? "settings" : "pet";
}

function usePetPackage(selectedId: string) {
  const [pkg, setPkg] = useState<PetPackage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const selected = petCatalog.find((item) => item.id === selectedId);
  const states = useMemo(() => (pkg ? listRenderableStates(pkg) : []), [pkg]);

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
          setPkg(nextPkg as PetPackage);
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

  return { selected, pkg, loadState, error, states };
}

function useDesktopState() {
  const [desktopState, setDesktopState] = useState(defaultDesktopState);

  useEffect(() => {
    void window.aiPetsDesktop?.getDesktopState().then(setDesktopState);
    return window.aiPetsDesktop?.onDesktopState(setDesktopState);
  }, []);

  return desktopState;
}

function PetView() {
  const [selectedId, setSelectedId] = useState(getInitialPetId);
  const { selected, pkg, loadState, error, states } = usePetPackage(selectedId);
  const [activeState, setActiveState] = useState("");
  const [message, setMessage] = useState(defaultMessage);
  const [elapsed, setElapsed] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragSnapshot | null>(null);

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
    if (!nextStateId) {
      return;
    }

    setElapsed(0);
    setActiveState(nextStateId);
  }

  function switchIdle() {
    switchState(findIdleStateId(states));
  }

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

  useEffect(() => {
    if (states.length === 0) {
      setActiveState("");
      return;
    }

    switchState(findIdleStateId(states));
    setMessage(defaultMessage);
  }, [states]);

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

  useEffect(() => {
    return window.aiPetsDesktop?.onPetCommand((command) => {
      if (command.type === "selectPet") {
        setSelectedId(command.selectedId);
        return;
      }
      if (command.type === "state") {
        switchState(command.stateId);
        return;
      }
      if (command.type === "interaction") {
        triggerInteraction(command.interactionId);
        return;
      }
      if (command.type === "say") {
        setMessage(command.message);
        return;
      }
      if (command.type === "playbackSpeed") {
        setPlaybackSpeed(clampPlaybackSpeed(command.value));
        return;
      }
      if (command.type === "idle") {
        switchIdle();
      }
    });
  }, [pkg, states]);

  async function startDrag(event: ReactPointerEvent) {
    if (event.button !== 0 || !window.aiPetsDesktop) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const position = await window.aiPetsDesktop.getWindowPosition();
    setDragging(true);
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

    const movementState = findMovementState(states, deltaX);
    if (movementState && movementState.id !== activeState && Math.abs(deltaX) > 12) {
      switchState(movementState.id);
    }

    void window.aiPetsDesktop.moveWindow({
      x: Math.round(snapshot.startWindowX + deltaX),
      y: Math.round(snapshot.startWindowY + deltaY)
    });
  }

  function endDrag(event: ReactPointerEvent) {
    const snapshot = dragRef.current;
    if (!snapshot || snapshot.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setDragging(false);
    if (snapshot.moved) {
      switchIdle();
    } else {
      triggerInteraction("click");
    }
  }

  function openContextMenu(event: ReactPointerEvent | React.MouseEvent) {
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
    <main className="pet-app" onContextMenu={openContextMenu}>
      <section className="pet-zone">
        {loadState === "loading" && <div className="notice">正在加载宠物...</div>}
        {loadState === "error" && <div className="notice error">{error}</div>}
        {loadState === "ready" && pkg && frame && selected && (
          <div className="pet-shell">
            <div className="speech">{message}</div>
            <div
              aria-label={`${pkg.displayName} 当前状态：${activeRenderableState?.label ?? activeState}`}
              className={`sprite${dragRef.current ? " dragging" : ""}`}
              onPointerCancel={endDrag}
              onPointerDown={(event) => void startDrag(event)}
              onPointerEnter={() => triggerInteraction("hover")}
              onPointerLeave={() => {
                if (!dragRef.current) {
                  switchIdle();
                }
              }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              role="img"
              style={spriteStyle}
              title="左键拖拽移动，右键打开菜单"
            />
          </div>
        )}
      </section>
    </main>
  );
}

function SettingsView() {
  const [selectedId, setSelectedId] = useState(getInitialPetId);
  const { selected, pkg, loadState, error, states } = usePetPackage(selectedId);
  const desktopState = useDesktopState();
  const [activeTab, setActiveTab] = useState<SettingsTab>("basic");
  const [message, setMessage] = useState(defaultMessage);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  function dispatch(command: PetCommand) {
    void window.aiPetsDesktop?.dispatchPetCommand(command);
  }

  function selectPet(nextSelectedId: string) {
    setSelectedId(nextSelectedId);
    dispatch({ type: "selectPet", selectedId: nextSelectedId });
  }

  function updatePlaybackSpeed(value: number) {
    const nextValue = clampPlaybackSpeed(value);
    setPlaybackSpeed(nextValue);
    dispatch({ type: "playbackSpeed", value: nextValue });
  }

  const debugInfo = {
    pet: selected?.label ?? "无",
    stateCount: states.length,
    sourceFormat: pkg?.sourceFormat ?? selected?.sourceType ?? "无",
    protocolVersion: pkg?.protocolVersion ?? "无"
  };

  return (
    <main className="settings-app">
      <aside className="settings-sidebar">
        <div className="brand-block">
          <span className="brand-mark">AI</span>
          <div>
            <strong>AI-Pets</strong>
            <p>桌面宠物设置</p>
          </div>
        </div>
        <nav className="settings-tabs" aria-label="设置分类">
          <button className={activeTab === "basic" ? "active" : ""} onClick={() => setActiveTab("basic")} type="button">
            基础设置
          </button>
          <button className={activeTab === "packages" ? "active" : ""} onClick={() => setActiveTab("packages")} type="button">
            宠物包
          </button>
          <button className={activeTab === "testing" ? "active" : ""} onClick={() => setActiveTab("testing")} type="button">
            测试工具
          </button>
        </nav>
      </aside>

      <section className="settings-content">
        {activeTab === "basic" && (
          <section className="settings-page">
            <header className="page-header">
              <p>General</p>
              <h1>基础设置</h1>
            </header>

            <div className="setting-card split-card">
              <div>
                <h2>宠物窗口</h2>
                <p>控制桌面宠物是否显示，以及是否保持在其他窗口上方。</p>
              </div>
              <div className="switch-list">
                <label className="switch-row">
                  <span>显示宠物</span>
                  <input
                    checked={desktopState.petVisible}
                    onChange={(event) => void window.aiPetsDesktop?.setPetVisible(event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <label className="switch-row">
                  <span>窗口置顶</span>
                  <input
                    checked={desktopState.alwaysOnTop}
                    onChange={(event) => void window.aiPetsDesktop?.setAlwaysOnTop(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>
            </div>

            <div className="setting-card">
              <h2>播放速度</h2>
              <label className="field">
                <span>{playbackSpeed.toFixed(2)}x</span>
                <input
                  max="1.5"
                  min="0.5"
                  onChange={(event) => updatePlaybackSpeed(Number(event.target.value))}
                  step="0.05"
                  type="range"
                  value={playbackSpeed}
                />
              </label>
            </div>

            <div className="setting-card">
              <h2>气泡文本</h2>
              <div className="inline-form">
                <input value={message} onChange={(event) => setMessage(event.target.value)} />
                <button onClick={() => dispatch({ type: "say", message })} type="button">
                  发送
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "packages" && (
          <section className="settings-page">
            <header className="page-header">
              <p>Packages</p>
              <h1>宠物包</h1>
            </header>

            <div className="setting-card">
              <h2>当前宠物</h2>
              <label className="field">
                <span>选择内置宠物包</span>
                <select value={selectedId} onChange={(event) => selectPet(event.target.value)}>
                  {petCatalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {loadState === "error" && <p className="error-text">{error}</p>}
              {loadState === "ready" && <p className="muted">已加载：{selected?.label}</p>}
            </div>

            <div className="setting-card disabled-card">
              <h2>导入宠物包</h2>
              <p>这里会接入本地文件选择器，支持导入符合 AI Pet Protocol 的宠物包目录或压缩包。</p>
              <button disabled type="button">
                导入功能下一步接入
              </button>
            </div>
          </section>
        )}

        {activeTab === "testing" && (
          <section className="settings-page">
            <header className="page-header">
              <p>Tools</p>
              <h1>测试工具</h1>
            </header>

            <div className="setting-card">
              <h2>动作状态</h2>
              <div className="button-grid">
                {states.map((state) => (
                  <button key={state.id} onClick={() => dispatch({ type: "state", stateId: state.id })} type="button">
                    {state.label}{state.custom ? "（自定义）" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-card">
              <h2>模拟 AI 事件</h2>
              <div className="button-grid">
                {pkg &&
                  Object.keys(pkg.interactions).map((interactionId) => (
                    <button key={interactionId} onClick={() => dispatch({ type: "interaction", interactionId })} type="button">
                      {interactionId}
                    </button>
                  ))}
              </div>
            </div>

            <div className="setting-card">
              <h2>调试信息</h2>
              <dl className="debug-list">
                <div><dt>宠物</dt><dd>{debugInfo.pet}</dd></div>
                <div><dt>状态数</dt><dd>{debugInfo.stateCount}</dd></div>
                <div><dt>来源格式</dt><dd>{debugInfo.sourceFormat}</dd></div>
                <div><dt>协议版本</dt><dd>{debugInfo.protocolVersion}</dd></div>
              </dl>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export function App() {
  return getViewMode() === "settings" ? <SettingsView /> : <PetView />;
}
