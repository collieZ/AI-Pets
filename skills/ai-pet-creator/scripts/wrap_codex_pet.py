#!/usr/bin/env python3
"""Wrap a Codex pet package with an AI Pet Protocol manifest."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path


PET_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+$")
CELL_WIDTH = 192
CELL_HEIGHT = 208
COLUMNS = 8
ROWS = 9

CODEX_TO_PROTOCOL_STATES = {
    "idle": ("待机", "idle", "idle", True),
    "running-right": ("向右移动", "moveRight", "moveRight", True),
    "running-left": ("向左移动", "moveLeft", "moveLeft", True),
    "waving": ("打招呼", "greet", "greet", False),
    "jumping": ("跳跃", "jump", "jump", False),
    "failed": ("失败", "error", "error", False),
    "waiting": ("等待输入", "waiting", "waiting", True),
    "running": ("工作中", "working", "working", True),
    "review": ("检查结果", "reviewing", "reviewing", True),
}

ANIMATION_ROWS = {
    "idle": (0, 8, 5),
    "running-right": (1, 8, 8),
    "running-left": (2, 8, 8),
    "waving": (3, 8, 7),
    "jumping": (4, 8, 8),
    "failed": (5, 8, 6),
    "waiting": (6, 8, 4),
    "running": (7, 8, 8),
    "review": (8, 8, 5),
}


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        value = json.load(file)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def assert_safe_pet_id(pet_id: str) -> None:
    if not pet_id or not PET_ID_PATTERN.match(pet_id):
        raise ValueError("pet id must be URL-safe: letters, digits, dot, underscore, or hyphen")


def copy_package(source_dir: Path, out_dir: Path, force: bool) -> None:
    if out_dir.exists():
        if not force:
            raise FileExistsError(f"{out_dir} already exists; pass --force to replace it")
        shutil.rmtree(out_dir)
    shutil.copytree(source_dir, out_dir)


def read_hatch_animation_rows(hatch_run_dir: Path | None) -> dict[str, tuple[int, int, int]]:
    if hatch_run_dir is None:
        return ANIMATION_ROWS

    request_path = hatch_run_dir / "pet_request.json"
    request = read_json(request_path)
    rows = request.get("rows")
    if not isinstance(rows, list):
        raise ValueError(f"{request_path} must contain a rows array")

    animation_rows = dict(ANIMATION_ROWS)
    for row_item in rows:
        if not isinstance(row_item, dict):
            continue
        state = row_item.get("state")
        row_index = row_item.get("row")
        frames = row_item.get("frames")
        if state not in ANIMATION_ROWS:
            continue
        if not isinstance(row_index, int) or not isinstance(frames, int):
            raise ValueError(f"invalid row metadata for {state!r} in {request_path}")
        _default_row, _default_frames, fps = ANIMATION_ROWS[state]
        animation_rows[state] = (row_index, frames, fps)
    return animation_rows


def build_manifest(
    pet_json: dict,
    source_dir: Path,
    pet_id: str,
    display_name: str,
    animation_rows: dict[str, tuple[int, int, int]],
) -> dict:
    description = pet_json.get("description") or f"{display_name} Codex compatible pet."
    spritesheet_path = pet_json.get("spritesheetPath") or "spritesheet.webp"

    states = {}
    for animation_id, (label, state_id, semantic_role, loop) in CODEX_TO_PROTOCOL_STATES.items():
        states[state_id] = {
            "label": label,
            "animation": animation_id,
            "semanticRole": semantic_role,
            "loop": loop,
        }

    animations = {}
    for animation_id, (row, frames, fps) in animation_rows.items():
        animations[animation_id] = {
            "row": row,
            "frames": frames,
            "fps": fps,
        }

    return {
        "protocolVersion": "0.1.0",
        "petId": pet_id,
        "displayName": display_name,
        "description": description,
        "sourceFormat": "ai-pet-protocol",
        "assets": {
            "atlas": {
                "path": spritesheet_path,
                "type": "spritesheet",
                "cellWidth": CELL_WIDTH,
                "cellHeight": CELL_HEIGHT,
                "columns": COLUMNS,
                "rows": ROWS,
            }
        },
        "states": states,
        "animationSets": {
            "default": {
                "animations": animations,
            }
        },
        "interactions": {
            "click": {
                "state": "greet",
                "say": f"你好，我是{display_name}。",
            },
            "aiWorking": {
                "semanticRole": "working",
                "say": f"{display_name}正在处理任务...",
            },
            "aiNeedsInput": {
                "semanticRole": "waiting",
                "say": "需要你看一眼。",
            },
            "aiReview": {
                "semanticRole": "reviewing",
                "say": "我来检查一下结果。",
            },
            "aiError": {
                "semanticRole": "error",
                "say": "刚刚好像遇到了一点问题。",
            },
            "aiDone": {
                "state": "idle",
                "say": "完成啦。",
            },
        },
        "capabilities": {
            "speechBubble": True,
            "drag": True,
            "stateMachine": True,
            "externalEvents": True,
            "customStates": False,
        },
        "compatibility": {
            "codexPet": {
                "supported": True,
                "sourcePath": "pet.json",
                "sourceDirectory": str(source_dir),
                "preset": "codex-9-state",
                "states": {
                    "idle": "idle",
                    "running-right": "moveRight",
                    "running-left": "moveLeft",
                    "waving": "greet",
                    "jumping": "jump",
                    "failed": "error",
                    "waiting": "waiting",
                    "running": "working",
                    "review": "reviewing",
                },
            }
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex-pet-dir", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--pet-id")
    parser.add_argument("--display-name")
    parser.add_argument(
        "--hatch-run-dir",
        type=Path,
        help="Optional hatch-pet run directory. When present, reads pet_request.json for exact row frame counts.",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    source_dir = args.codex_pet_dir.resolve()
    out_dir = args.out_dir.resolve()
    pet_json_path = source_dir / "pet.json"
    if not pet_json_path.exists():
        raise FileNotFoundError(f"missing {pet_json_path}")

    pet_json = read_json(pet_json_path)
    spritesheet_path = pet_json.get("spritesheetPath") or "spritesheet.webp"
    if not (source_dir / spritesheet_path).exists():
        raise FileNotFoundError(f"missing spritesheet: {source_dir / spritesheet_path}")

    pet_id = args.pet_id or pet_json.get("id")
    if not isinstance(pet_id, str):
        raise ValueError("pet id is required")
    assert_safe_pet_id(pet_id)
    display_name = args.display_name or pet_json.get("displayName") or pet_id
    if not isinstance(display_name, str) or not display_name.strip():
        raise ValueError("display name must be a non-empty string")

    copy_package(source_dir, out_dir, args.force)

    copied_pet_json_path = out_dir / "pet.json"
    copied_pet_json = read_json(copied_pet_json_path)
    copied_pet_json["id"] = pet_id
    copied_pet_json["displayName"] = display_name
    copied_pet_json.setdefault("spritesheetPath", spritesheet_path)
    write_json(copied_pet_json_path, copied_pet_json)

    animation_rows = read_hatch_animation_rows(args.hatch_run_dir.resolve() if args.hatch_run_dir else None)
    manifest = build_manifest(copied_pet_json, source_dir, pet_id, display_name, animation_rows)
    write_json(out_dir / "manifest.json", manifest)
    write_json(
        out_dir / "source.json",
        {
            "kind": "wrapped-codex-pet",
            "sourcePath": str(source_dir),
            "petJson": "pet.json",
            "manifest": "manifest.json",
            "spritesheet": spritesheet_path,
        },
    )

    print(f"wrapped {source_dir} -> {out_dir}")


if __name__ == "__main__":
    main()
