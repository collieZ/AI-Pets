# AI-Pets POC Design

## Goal

Build the first proof of concept for AI-Pets: an extensible AI pet product that can run as a standalone desktop pet on Windows/macOS later, and can also evolve toward hardware displays with LLM-powered interaction.

This POC validates the common foundation:

- A custom AI Pet Protocol that is not tied to Codex.
- A project-local skill that can create pets compatible with that protocol.
- A Codex pet compatibility adapter that can parse Codex-style pet assets and render them through the same protocol model.
- A web-based renderer and interaction playground for fast validation.
- A `task.JSON` roadmap and durable documentation for later iterations.

Tests are optional for this POC, per the initial request. The implementation should still include enough manual validation notes and example assets to prove the flow works.

## Scope

### In Scope

- Define `AI Pet Protocol v0` as the internal package format.
- Support sprite-atlas animation, including Codex-style rows and frame counts.
- Implement a web POC that loads example pet packages, renders animation states, and supports simple interaction.
- Implement a Codex compatibility adapter that maps `pet.json + spritesheet.webp/png` into the unified protocol model.
- Create a project-local `ai-pet-creator` skill template that instructs Codex how to generate protocol-compatible pet packages.
- Provide one or more lightweight example pets for validating the renderer and protocol.
- Create documentation for protocol, adapter behavior, POC usage, MVP desktop plan, hardware-stage direction, and task planning.

### Out of Scope

- Native Windows/macOS floating pet app.
- Real hardware firmware or device drivers.
- Production LLM integration.
- Marketplace, account system, billing, or cloud sync.
- Full automated test coverage.
- Full visual generation pipeline parity with `hatch-pet`.

## Recommended Approach

Use a protocol-first Web POC.

The web app should not render Codex pets directly. Instead, every source format should be normalized into a shared `PetPackage` model:

```text
Codex pet.json + spritesheet -> codex-pet-adapter -> PetPackage -> pet-renderer -> Web POC
AI Pet Protocol package      -> pet-protocol      -> PetPackage -> pet-renderer -> Web POC
```

This keeps Codex compatibility as an adapter, not the core identity of the product. Later desktop and hardware clients can reuse the same protocol and renderer concepts without inheriting Codex-specific assumptions.

## Architecture

### Repository Layout

```text
AI-Pets/
  apps/
    web-poc/
      src/
      public/
      package.json
  packages/
    pet-protocol/
      src/
    pet-renderer/
      src/
    codex-pet-adapter/
      src/
  skills/
    ai-pet-creator/
      SKILL.md
      references/
      scripts/
  pets/
    examples/
  docs/
    protocol/
    poc/
    adapters/
    skills/
    roadmap/
    superpowers/specs/
  task.JSON
  package.json
```

### Package Responsibilities

`packages/pet-protocol`

- Owns protocol schema, TypeScript types, validation, and version metadata.
- Exposes a normalized `PetPackage` type used by renderers and adapters.
- Keeps migration hooks explicit even if v0 has no real migrations yet.

`packages/pet-renderer`

- Owns atlas frame selection, animation timing, state transitions, and rendering helpers.
- Should be renderer-agnostic where possible, with a DOM/canvas implementation for the Web POC.
- Does not know about Codex package files directly.

`packages/codex-pet-adapter`

- Reads Codex-style manifests such as `pet.json`.
- Maps Codex states and atlas geometry into `PetPackage`.
- Documents compatibility assumptions and failure modes.

`apps/web-poc`

- Provides the first validation surface.
- Loads bundled examples from `pets/examples`.
- Lets the user switch states, click/tap the pet, drag the pet inside the browser surface, and simulate AI events.
- Shows debug metadata such as current state, frame index, protocol version, and source format.

`skills/ai-pet-creator`

- A project-local Codex skill template, not installed globally in v0.
- Teaches Codex how to create protocol-compatible pet packages.
- References the AI Pet Protocol docs and can optionally reuse ideas from `hatch-pet`.
- Emits package files that the Web POC can load.

## Protocol v0

### Design Principles

- Protocol-owned state names must be stable and portable.
- Codex compatibility should be represented through `compatibility`, not by making all future clients Codex-shaped.
- Assets should be explicit and relative to the pet package root.
- Capabilities should describe what a pet can do, while interactions describe how external events trigger behavior.
- Versioning should allow future migration without breaking v0 packages.

### Manifest Shape

```json
{
  "protocolVersion": "0.1.0",
  "petId": "example-buddy",
  "displayName": "Example Buddy",
  "description": "A compact animated AI pet used by the POC.",
  "assets": {
    "atlas": {
      "path": "spritesheet.png",
      "type": "spritesheet",
      "cellWidth": 192,
      "cellHeight": 208,
      "columns": 8,
      "rows": 9
    }
  },
  "states": {
    "idle": { "animation": "idle", "loop": true },
    "moveRight": { "animation": "running-right", "loop": true },
    "moveLeft": { "animation": "running-left", "loop": true },
    "greet": { "animation": "waving", "loop": false },
    "jump": { "animation": "jumping", "loop": false },
    "error": { "animation": "failed", "loop": false },
    "waiting": { "animation": "waiting", "loop": true },
    "working": { "animation": "running", "loop": true },
    "reviewing": { "animation": "review", "loop": true }
  },
  "animationSets": {
    "default": {
      "animations": {
        "idle": { "row": 0, "frames": 6, "fps": 8 },
        "running-right": { "row": 1, "frames": 8, "fps": 12 },
        "running-left": { "row": 2, "frames": 8, "fps": 12 },
        "waving": { "row": 3, "frames": 6, "fps": 8 },
        "jumping": { "row": 4, "frames": 8, "fps": 12 },
        "failed": { "row": 5, "frames": 6, "fps": 8 },
        "waiting": { "row": 6, "frames": 6, "fps": 8 },
        "running": { "row": 7, "frames": 8, "fps": 12 },
        "review": { "row": 8, "frames": 6, "fps": 8 }
      }
    }
  },
  "interactions": {
    "click": { "state": "greet", "say": "Hi!" },
    "dragStart": { "state": "moveRight" },
    "aiWorking": { "state": "working", "say": "Working on it..." },
    "aiNeedsInput": { "state": "waiting", "say": "I need your input." },
    "aiError": { "state": "error", "say": "Something went wrong." },
    "aiReview": { "state": "reviewing", "say": "Reviewing the result." }
  },
  "capabilities": {
    "speechBubble": true,
    "drag": true,
    "stateMachine": true,
    "externalEvents": true
  },
  "compatibility": {
    "codexPet": {
      "supported": true,
      "stateRows": "codex-9-row-atlas"
    }
  }
}
```

The exact schema can be refined during implementation, but these top-level concepts should remain stable in v0.

## Codex Compatibility

The POC should support Codex-style pets as an import source with the following assumptions:

- Manifest file: `pet.json`.
- Sprite asset: `spritesheet.webp` or `spritesheet.png`.
- Atlas cell size: `192x208`.
- Atlas dimensions: `1536x1872`.
- Rows: `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`.

The adapter should normalize these states:

```text
idle          -> idle
running-right -> moveRight
running-left  -> moveLeft
waving        -> greet
jumping       -> jump
failed        -> error
waiting       -> waiting
running       -> working
review        -> reviewing
```

The adapter should reject or warn on missing sprite assets, unknown atlas geometry, invalid row/frame definitions, or unsupported manifest fields that would change runtime behavior.

## Web POC UX

The first screen should be the working pet playground, not a marketing page.

Required controls:

- Pet package selector.
- State buttons for all normalized states.
- Simulated AI event buttons: working, needs input, review, error, done.
- Speech text input or preset messages.
- Drag interaction inside the browser stage.
- Debug panel with source format, protocol version, current state, animation frame, FPS, and asset info.

Required states:

- Loading package.
- Package validation error.
- Missing asset error.
- Empty package list.
- Normal rendering.

Visual style should be practical and focused. This is a protocol validation surface, so clarity matters more than decorative polish.

## Skill Design

The `ai-pet-creator` skill should be scoped to project packages first:

- Read the protocol docs before generating a pet.
- Create a package directory under `pets/examples` or a user-provided output directory.
- Produce a protocol manifest, sprite asset references, metadata, and a short README-like usage note only if needed by the package.
- Prefer generated or provided sprite assets when available.
- If adapting a Codex pet, preserve the original files and create an AI Pet Protocol manifest that references them.

The skill should not attempt to become a full replacement for `hatch-pet` in v0. Instead, it should document when to use `hatch-pet` to produce Codex-compatible atlas assets, then wrap those assets in AI Pet Protocol packaging.

## Documentation Plan

Create these documents during implementation:

- `docs/protocol/ai-pet-protocol-v0.md`
- `docs/poc/web-poc.md`
- `docs/adapters/codex-pet-compatibility.md`
- `docs/skills/ai-pet-creator.md`
- `docs/roadmap/mvp-desktop.md`
- `docs/roadmap/hardware-product.md`

The docs should make future compatibility explicit:

- Desktop apps should consume the protocol package, not Web POC internals.
- Hardware clients may use a reduced renderer but should keep the manifest and state concepts.
- AI integrations should send semantic pet events instead of controlling animation frames directly.

## Roadmap and task.JSON

`task.JSON` should track at least three phases:

1. `poc`
   - Protocol v0.
   - Web renderer and playground.
   - Codex adapter.
   - Project-local pet creator skill.
   - Example packages and documentation.

2. `mvp-desktop`
   - Windows/macOS standalone pet app.
   - Transparent always-on-top pet window.
   - Package import.
   - Local settings.
   - External AI app event bridge.

3. `hardware-product`
   - Hardware display architecture.
   - Runtime format for constrained devices.
   - Input sensors and interaction model.
   - LLM connectivity options.
   - OTA and content update strategy.

Each task should include id, title, phase, status, priority, dependencies, deliverables, and acceptance criteria.

## Implementation Notes

- Prefer TypeScript for protocol and renderer packages.
- Prefer a simple Vite web app for the POC unless the implementation pass discovers a stronger local reason.
- Keep dependencies light.
- Keep protocol validation deterministic and separate from UI.
- Keep generated example assets simple; visual fidelity can improve after the protocol loop is proven.
- Do not require tests for POC completion, but leave the project structure ready for later test coverage.

## Acceptance Criteria

The POC is complete when:

- The repository contains the planned protocol, renderer, adapter, Web POC, skill, docs, examples, and `task.JSON`.
- The Web POC can load at least one AI Pet Protocol package.
- The Web POC can render all v0 states and switch between them.
- The Web POC can simulate AI events and display pet speech.
- The Codex adapter can normalize a Codex-style pet package into the shared protocol model.
- The `ai-pet-creator` skill exists as a project-local skill with clear usage instructions.
- Documentation explains protocol v0, Codex compatibility, Web POC usage, MVP desktop direction, hardware direction, and staged tasks.
- Manual verification has been run and recorded in the final response.

## Open Decisions

- Whether the project-local skill should later be installed globally into the user's Codex skills directory.
- Whether native desktop should use Tauri, Electron, or another shell.
- Whether the hardware client should render full spritesheets or use a compiled binary/resource format.
- Which external AI applications should receive first-class integration in the MVP.

