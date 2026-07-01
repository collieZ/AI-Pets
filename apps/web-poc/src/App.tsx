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

interface DragSnapshot {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

const defaultMessage = "你好，我是 AI 宠物。";

const speechPresets = ["你好，准备开始。", "正在思考下一步。", "任务完成啦。"];

function joinAssetUrl(selected: PetCatalogItem, pkg: PetPackage) {
  return `${selected.assetBaseUrl}${pkg.assets.atlas.path}`;
}

function getValidationMessage(pkg: unknown) {
  const result = validatePetPackage(pkg);
  if (result.ok) {
    return "";
  }

  return result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
}

function findMovementState(states: RenderableState[], deltaX: number) {
  const role = deltaX >= 0 ? "moveRight" : "moveLeft";
  return states.find((state) => state.semanticRole === role);
}

function findIdleStateId(states: RenderableState[]) {
  return states.find((state) => state.semanticRole === "idle")?.id ?? states[0]?.id ?? "";
}

function clampPlaybackSpeed(value: number) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0.5, Math.min(1.5, value));
}

export function App() {
  const [selectedId, setSelectedId] = useState(petCatalog[0]?.id ?? "");
  const [pkg, setPkg] = useState<PetPackage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [activeState, setActiveState] = useState("");
  const [message, setMessage] = useState(defaultMessage);
  const [elapsed, setElapsed] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    let cancelled = false;

    async function loadPet() {
      if (!selected) {
        setLoadState("error");
        setError("宠物目录为空，无法加载。");
        return;
      }

      setLoadState("loading");
      setError("");
      setPkg(null);
      setActiveState("");
      setPosition({ x: 0, y: 0 });

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
    if (!idleStateId || idleStateId === activeState) {
      return;
    }

    const animation = pkg.animationSets.default.animations[state.animation];
    if (!animation) {
      return;
    }

    const timeoutMs = getAnimationDurationMs(animation) / playbackSpeed;
    const timeout = window.setTimeout(() => {
      setElapsed(0);
      setActiveState((currentState) => (currentState === activeState ? idleStateId : currentState));
    }, timeoutMs);

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

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y
    };
    setDragging(true);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const snapshot = dragRef.current;
    if (!snapshot || snapshot.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - snapshot.startClientX;
    const deltaY = event.clientY - snapshot.startClientY;
    const stage = stageRef.current?.getBoundingClientRect();
    const maxX = stage ? Math.max(40, stage.width / 2 - 120) : 260;
    const maxY = stage ? Math.max(40, stage.height / 2 - 140) : 220;

    setPosition({
      x: Math.max(-maxX, Math.min(maxX, snapshot.startX + deltaX)),
      y: Math.max(-maxY, Math.min(maxY, snapshot.startY + deltaY))
    });

    const movementState = findMovementState(states, deltaX);
    if (movementState && movementState.id !== activeState && Math.abs(deltaX) > 12) {
      switchState(movementState.id);
    }
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  }

  const spriteStyle: CSSProperties | undefined =
    pkg && selected && frame
      ? {
          width: pkg.assets.atlas.cellWidth,
          height: pkg.assets.atlas.cellHeight,
          backgroundImage: `url(${joinAssetUrl(selected, pkg)})`,
          backgroundPosition: `-${frame.x}px -${frame.y}px`,
          transform: `translate(${position.x}px, ${position.y}px)`
        }
      : undefined;

  const debugInfo = {
    currentState: activeState || "无",
    frame: frame?.frameIndex ?? "无",
    sourceFormat: pkg?.sourceFormat ?? selected?.sourceType ?? "无",
    semanticRole: activeRenderableState?.semanticRole ?? "无",
    protocolVersion: pkg?.protocolVersion ?? "无"
  };

  return (
    <main className="app" aria-label="AI-Pets POC 验证台">
      <section className="stage" ref={stageRef} aria-label="宠物舞台">
        <div className="stage-surface">
          {loadState === "loading" && (
            <div className="notice" role="status">
              正在加载宠物包...
            </div>
          )}

          {loadState === "error" && (
            <div className="notice error" role="alert">
              <strong>加载失败</strong>
              <span>{error}</span>
            </div>
          )}

          {loadState === "ready" && pkg && states.length === 0 && (
            <div className="notice" role="status">
              这个宠物包通过了校验，但没有可渲染状态。
            </div>
          )}

          {loadState === "ready" && pkg && frame && selected && states.length > 0 && (
            <div className="pet-shell">
              <div className="speech" aria-live="polite">
                {message}
              </div>
              <div
                className={`sprite${dragging ? " dragging" : ""}`}
                role="img"
                aria-label={`${pkg.displayName} 当前状态：${activeRenderableState?.label ?? activeState}`}
                onClick={() => triggerInteraction("click")}
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={spriteStyle}
              />
            </div>
          )}
        </div>
      </section>

      <aside className="panel" aria-label="控制面板">
        <div className="panel-header">
          <p>AI-Pets POC</p>
          <h1>宠物验证台</h1>
        </div>

        <label className="field">
          <span>宠物包</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {petCatalog.length === 0 && <option value="">没有宠物</option>}
            {petCatalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <section className="control-group">
          <h2>动作状态</h2>
          <div className="button-grid">
            {states.map((state) => (
              <button
                className={state.id === activeState ? "active" : ""}
                key={state.id}
                type="button"
                onClick={() => switchState(state.id)}
              >
                {state.label}
                {state.custom ? "（自定义）" : ""}
              </button>
            ))}
          </div>
          {loadState === "ready" && states.length === 0 && <p className="muted">没有可渲染状态。</p>}
        </section>

        <section className="control-group">
          <h2>播放设置</h2>
          <label className="field">
            <span>播放速度：{playbackSpeed.toFixed(2)}x</span>
            <input
              max="1.5"
              min="0.5"
              onChange={(event) => updatePlaybackSpeed(Number(event.target.value))}
              onInput={(event) => updatePlaybackSpeed(Number(event.currentTarget.value))}
              step="0.05"
              type="range"
              value={playbackSpeed}
            />
          </label>
          <label className="field">
            <span>速度数值</span>
            <input
              max="1.5"
              min="0.5"
              onChange={(event) => updatePlaybackSpeed(Number(event.target.value))}
              step="0.05"
              type="number"
              value={playbackSpeed}
            />
          </label>
          <p className="muted">默认节奏由宠物包 fps 决定；这里用于临时放慢或加快验证效果。</p>
        </section>

        <section className="control-group">
          <h2>模拟 AI 事件</h2>
          <div className="button-grid">
            {pkg &&
              Object.keys(pkg.interactions).map((interactionId) => (
                <button key={interactionId} type="button" onClick={() => triggerInteraction(interactionId)}>
                  {interactionId}
                </button>
              ))}
          </div>
          {loadState === "ready" && pkg && Object.keys(pkg.interactions).length === 0 && (
            <p className="muted">没有可触发事件。</p>
          )}
        </section>

        <section className="control-group">
          <h2>气泡文本</h2>
          <label className="field">
            <span>当前消息</span>
            <input value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <div className="preset-row">
            {speechPresets.map((preset) => (
              <button key={preset} type="button" onClick={() => setMessage(preset)}>
                {preset}
              </button>
            ))}
          </div>
        </section>

        <section className="control-group">
          <h2>调试面板</h2>
          <dl className="debug-list">
            <div>
              <dt>当前状态</dt>
              <dd>{debugInfo.currentState}</dd>
            </div>
            <div>
              <dt>当前帧</dt>
              <dd>{debugInfo.frame}</dd>
            </div>
            <div>
              <dt>来源格式</dt>
              <dd>{debugInfo.sourceFormat}</dd>
            </div>
            <div>
              <dt>语义角色</dt>
              <dd>{debugInfo.semanticRole}</dd>
            </div>
            <div>
              <dt>协议版本</dt>
              <dd>{debugInfo.protocolVersion}</dd>
            </div>
          </dl>
        </section>
      </aside>
    </main>
  );
}
