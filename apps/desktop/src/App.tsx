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
import { mergePetCatalogs } from "./petCatalogModel";
import { getSpriteViewportStyle } from "./spriteLayout";
import type {
  DesktopPlatform,
  DesktopState,
  PetCommand,
  PetImportPreview,
  RecoverySummary,
  SettingsWindowAction
} from "./desktopContracts";

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

const defaultMessage = "你好，我是 AI 宠物。";
const speechDisplayDurationMs = 4200;
const speechFadeDurationMs = 280;
const defaultDesktopState: DesktopState = {
  settingsOpen: false,
  petVisible: true,
  alwaysOnTop: true
};

function getInitialPetId(catalog: PetCatalogItem[]) {
  return catalog[1]?.id ?? catalog[0]?.id ?? "";
}

function joinAssetUrl(selected: PetCatalogItem, pkg: PetPackage) {
  const baseUrl = new URL(selected.assetBaseUrl, window.location.href);
  const encodedPath = pkg.assets.atlas.path.split("/").map(encodeURIComponent).join("/");
  return new URL(encodedPath, baseUrl).toString();
}

function getValidationMessage(pkg: unknown) {
  const result = validatePetPackage(pkg);
  return result.ok ? "" : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
}

function getPetLoadErrorMessage(caught: unknown, selected: PetCatalogItem) {
  const rawMessage = caught instanceof Error ? caught.message : String(caught);
  if (rawMessage === "Failed to fetch" && selected.manifestUrl.startsWith("ai-pets://")) {
    return "无法读取导入宠物资源。请完全重启应用后重试；如果仍失败，请检查导入目录中的 pet.json/manifest.json 和 spritesheet 是否完整。";
  }
  if (rawMessage === "Failed to fetch") {
    return `无法读取宠物 manifest：${selected.manifestUrl}`;
  }
  return rawMessage;
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

function clampPetScale(value: number) {
  return Number.isFinite(value) ? Math.max(0.65, Math.min(1.25, value)) : 1;
}

function getPetSourceLabel(sourceType: PetCatalogItem["sourceType"]) {
  return sourceType === "codex-pet" ? "Codex 宠物协议" : "AI-Pets 宠物协议";
}

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const characters = Array.from(text);
  const lines: string[] = [];
  let line = "";

  for (const character of characters) {
    const nextLine = `${line}${character}`;
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = character;
      continue;
    }

    line = nextLine;
  }

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function getViewMode() {
  return new URLSearchParams(window.location.search).get("view") === "settings" ? "settings" : "pet";
}

function getFallbackDesktopPlatform(): DesktopPlatform {
  const platform = navigator.platform;
  if (/mac/i.test(platform)) {
    return "darwin";
  }
  if (/linux/i.test(platform)) {
    return "linux";
  }
  return "win32";
}

function usePetPackage(catalog: PetCatalogItem[], selectedId: string) {
  const [pkg, setPkg] = useState<PetPackage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const selected = catalog.find((item) => item.id === selectedId);
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
          setError(getPetLoadErrorMessage(caught, selected));
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

function useMergedPetCatalog() {
  const [importedPets, setImportedPets] = useState<PetCatalogItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refreshImportedPets() {
      const nextImportedPets = await window.aiPetsDesktop?.listImportedPets();
      if (!cancelled && nextImportedPets) {
        setImportedPets(nextImportedPets);
      }
    }

    void refreshImportedPets();
    const removeListener = window.aiPetsDesktop?.onImportedPetsChanged(() => {
      void refreshImportedPets();
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, []);

  const catalog = useMemo(() => mergePetCatalogs(petCatalog, importedPets), [importedPets]);

  return { catalog, importedPets };
}

function PetView() {
  const { catalog } = useMergedPetCatalog();
  const [selectedId, setSelectedId] = useState(() => getInitialPetId(catalog));
  const { selected, pkg, loadState, error, states } = usePetPackage(catalog, selectedId);
  const [activeState, setActiveState] = useState("");
  const [speech, setSpeech] = useState<string | null>(null);
  const [speechDeadline, setSpeechDeadline] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [petScale, setPetScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [loadedSpriteUrl, setLoadedSpriteUrl] = useState("");
  const petCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spriteImageRef = useRef<HTMLImageElement | null>(null);
  const speechSlotRef = useRef<HTMLDivElement | null>(null);
  const spriteSlotRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSnapshot | null>(null);
  const lastPetWindowInvalidationRef = useRef(0);
  const lastPetWindowInvalidationKeyRef = useRef("");

  const speechOpacity =
    speech && speechDeadline
      ? Math.max(0, Math.min(1, (speechDeadline - performance.now()) / speechFadeDurationMs))
      : 0;

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

  function showSpeech(nextSpeech: string) {
    const normalizedSpeech = nextSpeech.trim();
    if (!normalizedSpeech) {
      setSpeech(null);
      setSpeechDeadline(null);
      return;
    }

    setSpeech(normalizedSpeech);
    setSpeechDeadline(performance.now() + speechDisplayDurationMs);
  }

  useEffect(() => {
    const getPreferences = window.aiPetsDesktop?.getPreferences;
    if (typeof getPreferences !== "function") {
      return;
    }

    void getPreferences().then((preferences) => {
      if (preferences.selectedPetId) {
        setSelectedId(preferences.selectedPetId);
      }
      setPlaybackSpeed(clampPlaybackSpeed(preferences.playbackSpeed));
      setPetScale(clampPetScale(preferences.petScale));
    });
  }, []);

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
      showSpeech(say);
    }
  }

  useEffect(() => {
    if (states.length === 0) {
      setActiveState("");
      return;
    }

    switchState(findIdleStateId(states));
    setSpeech(null);
    setSpeechDeadline(null);
  }, [states]);

  useEffect(() => {
    if (!speech || !speechDeadline) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSpeech(null);
      setSpeechDeadline(null);
    }, Math.max(0, speechDeadline - performance.now()));

    return () => window.clearTimeout(timeout);
  }, [speech, speechDeadline]);

  const spriteUrl = pkg && selected ? joinAssetUrl(selected, pkg) : "";

  useEffect(() => {
    if (!spriteUrl) {
      spriteImageRef.current = null;
      setLoadedSpriteUrl("");
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!cancelled) {
        spriteImageRef.current = image;
        setLoadedSpriteUrl(spriteUrl);
      }
    };
    image.src = spriteUrl;

    return () => {
      cancelled = true;
    };
  }, [spriteUrl]);

  useEffect(() => {
    if (!pkg || !frame || loadedSpriteUrl !== spriteUrl) {
      return;
    }

    const canvas = petCanvasRef.current;
    const image = spriteImageRef.current;
    const speechSlot = speechSlotRef.current;
    const spriteSlot = spriteSlotRef.current;
    if (!canvas || !image || !spriteSlot) {
      return;
    }

    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const canvasRect = canvas.getBoundingClientRect();
    const slotRect = spriteSlot.getBoundingClientRect();
    const canvasWidth = Math.max(1, Math.round(canvasRect.width * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(canvasRect.height * pixelRatio));
    const drawX = slotRect.left - canvasRect.left;
    const drawY = slotRect.top - canvasRect.top;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingEnabled = true;

    if (speech && speechSlot && speechOpacity > 0) {
      const speechRect = speechSlot.getBoundingClientRect();
      const speechX = speechRect.left - canvasRect.left;
      const speechY = speechRect.top - canvasRect.top;
      const speechWidth = speechRect.width;
      const speechHeight = speechRect.height;
      const tailCenterX = speechX + speechWidth / 2;

      context.save();
      context.globalAlpha = speechOpacity;
      context.shadowColor = "rgb(46 77 106 / 20%)";
      context.shadowBlur = 18;
      context.shadowOffsetY = 7;
      context.beginPath();
      context.moveTo(tailCenterX - 8, speechY + speechHeight - 1);
      context.lineTo(tailCenterX, speechY + speechHeight + 7);
      context.lineTo(tailCenterX + 8, speechY + speechHeight - 1);
      context.closePath();
      context.fillStyle = "rgb(243 250 255 / 88%)";
      context.fill();
      drawRoundedRect(context, speechX, speechY, speechWidth, speechHeight, 14);
      context.fillStyle = "rgb(243 250 255 / 88%)";
      context.fill();
      context.shadowColor = "transparent";
      context.strokeStyle = "rgb(255 255 255 / 92%)";
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = "#36546c";
      context.font = '600 15px "PingFang SC", "SF Pro Display", system-ui, sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      const lines = wrapCanvasText(context, speech, speechWidth - 24);
      const lineHeight = 22;
      const firstLineY = speechY + speechHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, index) => {
        context.fillText(line, speechX + speechWidth / 2, firstLineY + index * lineHeight);
      });
      context.restore();
    }

    context.drawImage(image, frame.x, frame.y, frame.width, frame.height, drawX, drawY, slotRect.width, slotRect.height);

    const invalidationKey = `${activeState}:${speech ?? ""}:${Math.round(speechOpacity * 10)}:${loadedSpriteUrl}`;
    const shouldForceInvalidation = lastPetWindowInvalidationKeyRef.current !== invalidationKey;
    const now = performance.now();
    if (shouldForceInvalidation || now - lastPetWindowInvalidationRef.current > 100) {
      lastPetWindowInvalidationKeyRef.current = invalidationKey;
      lastPetWindowInvalidationRef.current = now;
      void window.aiPetsDesktop?.invalidatePetWindow();
    }
  }, [activeState, frame, loadedSpriteUrl, petScale, pkg, speech, speechOpacity, spriteUrl]);

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
        showSpeech(command.message);
        return;
      }
      if (command.type === "playbackSpeed") {
        setPlaybackSpeed(clampPlaybackSpeed(command.value));
        return;
      }
      if (command.type === "petScale") {
        setPetScale(clampPetScale(command.value));
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

  const spriteViewportStyle: CSSProperties | undefined =
    pkg && selected && frame
      ? getSpriteViewportStyle(pkg.assets.atlas, petScale)
      : undefined;

  return (
    <main className="pet-app" onContextMenu={openContextMenu}>
      <section className="pet-zone">
        {loadState === "ready" && pkg && frame && selected && (
          <canvas aria-hidden="true" className="pet-canvas" ref={petCanvasRef} />
        )}
        {loadState === "ready" && pkg && frame && selected && (
          <div className="pet-shell">
            {speech && <div aria-hidden="true" className="speech-slot" ref={speechSlotRef}>{speech}</div>}
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
              ref={spriteSlotRef}
              role="img"
              style={spriteViewportStyle}
              title="左键拖拽移动，右键打开菜单"
            />
          </div>
        )}
      </section>
    </main>
  );
}

function SettingsView() {
  const { catalog, importedPets } = useMergedPetCatalog();
  const [selectedId, setSelectedId] = useState(() => getInitialPetId(catalog));
  const { selected, pkg, loadState, error, states } = usePetPackage(catalog, selectedId);
  const desktopState = useDesktopState();
  const [activeTab, setActiveTab] = useState<SettingsTab>("basic");
  const [message, setMessage] = useState(defaultMessage);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [petScale, setPetScale] = useState(1);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [pendingImport, setPendingImport] = useState<PetImportPreview | null>(null);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [platform, setPlatform] = useState<DesktopPlatform>(getFallbackDesktopPlatform);
  const [recoverySummary, setRecoverySummary] = useState<RecoverySummary | null>(null);

  useEffect(() => {
    const getPlatform = window.aiPetsDesktop?.getPlatform;
    if (typeof getPlatform !== "function") {
      return;
    }

    void getPlatform().then(setPlatform);
  }, []);

  useEffect(() => {
    void window.aiPetsDesktop?.getRecoverySummary().then(setRecoverySummary);
  }, []);

  useEffect(() => {
    const getPreferences = window.aiPetsDesktop?.getPreferences;
    if (typeof getPreferences !== "function") {
      return;
    }

    void getPreferences().then((preferences) => {
      if (preferences.selectedPetId) {
        setSelectedId(preferences.selectedPetId);
      }
      setPlaybackSpeed(clampPlaybackSpeed(preferences.playbackSpeed));
      setPetScale(clampPetScale(preferences.petScale));
    });
  }, []);

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

  function updatePetScale(value: number) {
    const nextValue = clampPetScale(value);
    setPetScale(nextValue);
    dispatch({ type: "petScale", value: nextValue });
  }

  async function importPetFolder() {
    if (!window.aiPetsDesktop || importing) {
      return;
    }

    setImporting(true);
    setImportMessage("");
    setImportError("");
    setPendingImport(null);

    try {
      const result = await window.aiPetsDesktop.selectImportPetFolder();
      if (result.ok) {
        setPendingImport(result.preview);
        setImportMessage("宠物包已通过预检，请确认导入。");
        return;
      }

      if (result.reason === "cancelled") {
        setImportMessage("已取消导入。");
        return;
      }
      if (result.reason === "invalid-package") {
        setImportError(`无法导入：${result.message ?? "宠物包校验失败。"}`);
        return;
      }

      setImportError("导入失败，请检查宠物文件夹。");
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setImporting(false);
    }
  }

  async function confirmPetImport() {
    if (!window.aiPetsDesktop || !pendingImport || importing) {
      return;
    }

    setImporting(true);
    setImportMessage("");
    setImportError("");
    try {
      const result = await window.aiPetsDesktop.confirmImportPetFolder(pendingImport.token);
      if (result.ok) {
        selectPet(result.pet.id);
        setImportMessage(`${pendingImport.alreadyExists ? "已覆盖并导入" : "已导入"}：${result.pet.label}`);
        setPendingImport(null);
        return;
      }
      setImportError(`无法导入：${result.message}`);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setImporting(false);
    }
  }

  async function cancelPetImport() {
    const token = pendingImport?.token;
    setPendingImport(null);
    await window.aiPetsDesktop?.cancelImportPetFolder(token);
    setImportMessage("已取消导入。");
  }

  async function resetSettings() {
    if (!window.aiPetsDesktop || !window.confirm("恢复默认设置会重置当前宠物、缩放、播放速度、显示与置顶状态，是否继续？")) {
      return;
    }

    const preferences = await window.aiPetsDesktop.resetPreferences();
    const defaultPetId = getInitialPetId(petCatalog);
    setSelectedId(defaultPetId);
    setPlaybackSpeed(clampPlaybackSpeed(preferences.playbackSpeed));
    setPetScale(clampPetScale(preferences.petScale));
    setMessage(defaultMessage);
    dispatch({ type: "selectPet", selectedId: defaultPetId });
    dispatch({ type: "playbackSpeed", value: preferences.playbackSpeed });
    dispatch({ type: "petScale", value: preferences.petScale });
    setSettingsMessage("已恢复默认设置。");
  }

  async function openPetDataDirectory() {
    if (!window.aiPetsDesktop) {
      return;
    }

    const result = await window.aiPetsDesktop.openPetDataDirectory();
    setSettingsMessage(result.ok ? "已打开宠物数据目录。" : `无法打开宠物数据目录：${result.message}`);
  }

  async function openPetQuarantineDirectory() {
    const result = await window.aiPetsDesktop?.openPetQuarantineDirectory();
    if (result && !result.ok) setImportError(`无法打开隔离目录：${result.message}`);
  }

  async function deleteImportedPet(pet: PetCatalogItem) {
    if (!window.aiPetsDesktop || !pet.manifestUrl.startsWith("ai-pets://imported-pets/")) {
      return;
    }

    const shouldDelete = window.confirm(`确定删除导入宠物「${pet.label}」吗？这会删除应用管理目录中的副本。`);
    if (!shouldDelete) {
      return;
    }

    setImportMessage("");
    setImportError("");

    try {
      const result = await window.aiPetsDesktop.deleteImportedPet(pet.id);
      if (result.ok) {
        if (selectedId === pet.id) {
          const fallbackPetId = getInitialPetId(petCatalog);
          selectPet(fallbackPetId);
        }
        setImportMessage(`已删除导入宠物：${pet.label}`);
        return;
      }

      setImportError(result.reason === "not-found" ? "未找到要删除的导入宠物，列表已刷新。" : `删除失败：${result.message ?? "事务未完成。"}`);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const debugInfo = {
    pet: selected?.label ?? "无",
    stateCount: states.length,
    sourceFormat: pkg?.sourceFormat ?? selected?.sourceType ?? "无",
    protocolVersion: pkg?.protocolVersion ?? "无"
  };

  function controlSettingsWindow(action: SettingsWindowAction) {
    void window.aiPetsDesktop?.controlSettingsWindow(action);
  }

  return (
    <main className="settings-app">
      <header className={`window-titlebar${platform === "darwin" ? " window-titlebar--mac" : ""}`}>
        <div className="window-titlebar__drag-region">
          <span></span>
        </div>
        {platform !== "darwin" && <div className="window-controls" aria-label="窗口控制">
          <button aria-label="最小化设置窗口" className="window-control window-control--minimize" onClick={() => controlSettingsWindow("minimize")} type="button">
            <span aria-hidden="true" />
          </button>
          <button aria-label="最大化或还原设置窗口" className="window-control window-control--maximize" onClick={() => controlSettingsWindow("maximize")} type="button">
            <span aria-hidden="true" />
          </button>
          <button aria-label="关闭设置窗口" className="window-control window-control--close" onClick={() => controlSettingsWindow("close")} type="button">
            <span aria-hidden="true" />
          </button>
        </div>}
      </header>
      <aside className="settings-sidebar">
        <div className="brand-block">
          <span className="brand-mark">AI</span>
          <div>
            <strong>AI-Pets</strong>
            <p>桌面陪伴控制台</p>
          </div>
        </div>
        <nav className="settings-tabs" aria-label="设置分类">
          <button className={activeTab === "basic" ? "active" : ""} onClick={() => setActiveTab("basic")} type="button">
            <span className="tab-icon" aria-hidden="true">◎</span>
            <span><b>基础设置</b><small>显示与交互</small></span>
          </button>
          <button className={activeTab === "packages" ? "active" : ""} onClick={() => setActiveTab("packages")} type="button">
            <span className="tab-icon" aria-hidden="true">✦</span>
            <span><b>宠物包</b><small>形象与资源</small></span>
          </button>
          <button className={activeTab === "testing" ? "active" : ""} onClick={() => setActiveTab("testing")} type="button">
            <span className="tab-icon" aria-hidden="true">⌁</span>
            <span><b>测试工具</b><small>动作与事件</small></span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <span>AI PETS</span>
          <p>把一小段陪伴，放在桌面上。</p>
        </div>
      </aside>

      <section className="settings-content">
        {activeTab === "basic" && (
          <section className="settings-page">
            <header className="page-header">
              <h1>基础设置</h1>
              <span>调校桌面伙伴的显示和互动方式。</span>
            </header>

            <div className="setting-card split-card">
              <div>
                <h2>宠物窗口</h2>
                <p>控制桌面宠物是否显示，以及是否保持在其他窗口上方。</p>
              </div>
              <div className="switch-list">
                <label className="switch-row">
                  <span><b>显示宠物</b><small>暂时隐藏或显示桌面伙伴</small></span>
                  <input className="switch-input"
                    checked={desktopState.petVisible}
                    onChange={(event) => void window.aiPetsDesktop?.setPetVisible(event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <label className="switch-row">
                  <span><b>窗口置顶</b><small>始终停留在工作窗口上方</small></span>
                  <input className="switch-input"
                    checked={desktopState.alwaysOnTop}
                    onChange={(event) => void window.aiPetsDesktop?.setAlwaysOnTop(event.target.checked)}
                    type="checkbox"
                  />
                </label>
              </div>
            </div>

            <div className="setting-card">
              <h2>宠物大小</h2>
              <label className="field">
                <span>{Math.round(petScale * 100)}%</span>
                <input
                  max="1.25"
                  min="0.65"
                  onChange={(event) => updatePetScale(Number(event.target.value))}
                  step="0.05"
                  type="range"
                  value={petScale}
                />
              </label>
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

            <div className="setting-card">
              <h2>数据与恢复</h2>
              <p>导入的宠物与偏好设置保存在应用专属数据目录中，不会写入项目资源。</p>
              <div className="row-actions">
                <button onClick={() => void openPetDataDirectory()} type="button">打开宠物数据目录</button>
                <button className="danger-button" onClick={() => void resetSettings()} type="button">恢复默认设置</button>
              </div>
              {settingsMessage && <p className="muted">{settingsMessage}</p>}
            </div>
          </section>
        )}

        {activeTab === "packages" && (
          <section className="settings-page">
            <header className="page-header">
              <h1>宠物包</h1>
              <span>管理内置形象与导入的自定义伙伴。</span>
            </header>

            {recoverySummary && (recoverySummary.recoveredTransaction || recoverySummary.quarantinedPetIds.length > 0) && (
              <div className="setting-card" role="status">
                <h2>宠物库已自动修复</h2>
                <p>
                  {recoverySummary.recoveredTransaction ? "已回滚上次未完成的操作。" : ""}
                  {recoverySummary.quarantinedPetIds.length > 0 ? ` 已隔离 ${recoverySummary.quarantinedPetIds.length} 个不安全或损坏的宠物包。` : ""}
                </p>
                {recoverySummary.quarantinedPetIds.length > 0 && (
                  <button onClick={() => void openPetQuarantineDirectory()} type="button">打开隔离目录</button>
                )}
              </div>
            )}

            <div className="setting-card">
              <h2>当前宠物</h2>
              <label className="field">
                <span>选择宠物包</span>
                <select value={selectedId} onChange={(event) => selectPet(event.target.value)}>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {loadState === "error" && <p className="error-text">{error}</p>}
              {loadState === "ready" && pkg && selected && (
                <p className="muted">
                  已加载：{selected.label} · {getPetSourceLabel(selected.sourceType)} · {states.length} 个状态 · {pkg.assets.atlas.cellWidth} × {pkg.assets.atlas.cellHeight} px
                </p>
              )}
            </div>

            <div className="setting-card">
              <h2>导入宠物包</h2>
              <p>选择一个包含 `manifest.json` 或 `pet.json` 的宠物文件夹。导入前会校验协议、动画结构和 WebP/PNG 雪碧图，成功后复制到应用管理目录，不依赖原始文件夹。</p>
              <button disabled={importing} onClick={() => void importPetFolder()} type="button">
                {importing ? "正在处理..." : "选择宠物文件夹"}
              </button>
              {pendingImport && (
                <div className="import-preview">
                  <div>
                    <strong>{pendingImport.label}</strong>
                    <p>{pendingImport.alreadyExists ? "检测到同 id 宠物，确认后会覆盖现有副本。" : "预检通过，确认后将复制到应用管理目录。"}</p>
                  </div>
                  <dl>
                    <div><dt>宠物 ID</dt><dd>{pendingImport.petId}</dd></div>
                    <div><dt>协议</dt><dd>{getPetSourceLabel(pendingImport.sourceType)}</dd></div>
                    <div><dt>动作数量</dt><dd>{pendingImport.actionCount}</dd></div>
                    <div><dt>雪碧图</dt><dd>{pendingImport.assetPath}</dd></div>
                  </dl>
                  <div className="row-actions">
                    <button onClick={() => void cancelPetImport()} type="button">取消</button>
                    <button disabled={importing} onClick={() => void confirmPetImport()} type="button">
                      {pendingImport.alreadyExists ? "覆盖并导入" : "确认导入"}
                    </button>
                  </div>
                </div>
              )}
              {importMessage && <p className="muted">{importMessage}</p>}
              {importError && <p className="error-text">{importError}</p>}
            </div>

            <div className="setting-card">
              <h2>已导入宠物</h2>
              {importedPets.length === 0 ? (
                <p className="muted">还没有导入宠物。点击上方按钮选择一个宠物文件夹。</p>
              ) : (
                <div className="imported-pet-list">
                  {importedPets.map((pet) => (
                    <div className="imported-pet-row" key={pet.id}>
                      <div>
                        <strong>{pet.label}</strong>
                        <p>{pet.id}{selectedId === pet.id ? " · 当前使用" : ""}</p>
                      </div>
                      <div className="row-actions">
                        <button disabled={selectedId === pet.id} onClick={() => selectPet(pet.id)} type="button">
                          选择
                        </button>
                        <button className="danger-button" onClick={() => void deleteImportedPet(pet)} type="button">
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "testing" && (
          <section className="settings-page">
            <header className="page-header">
              <h1>测试工具</h1>
              <span>快速检查宠物状态、动作和 AI 事件反馈。</span>
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
