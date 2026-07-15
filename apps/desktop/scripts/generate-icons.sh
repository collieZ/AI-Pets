#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DESKTOP_DIR=$(dirname "$SCRIPT_DIR")
ASSET_DIR="$DESKTOP_DIR/assets"
ICONSET_DIR="$ASSET_DIR/icon.iconset"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR" "$ICONSET_DIR"' EXIT

qlmanage -t -s 1024 -o "$TEMP_DIR" "$ASSET_DIR/icon.svg" >/dev/null 2>&1
mv "$TEMP_DIR/icon.svg.png" "$ASSET_DIR/icon.png"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ASSET_DIR/icon.png" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  doubled=$((size * 2))
  sips -z "$doubled" "$doubled" "$ASSET_DIR/icon.png" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET_DIR" -o "$ASSET_DIR/icon.icns"
rm -rf "$ICONSET_DIR"
sips -z 256 256 "$ASSET_DIR/icon.png" --out "$TEMP_DIR/icon-256.png" >/dev/null
ffmpeg -hide_banner -loglevel error -y -i "$TEMP_DIR/icon-256.png" "$ASSET_DIR/icon.ico"
sips -s format png "$ASSET_DIR/tray.svg" --out "$TEMP_DIR/tray-64.png" >/dev/null
sips -z 32 32 "$TEMP_DIR/tray-64.png" --out "$ASSET_DIR/tray.png" >/dev/null
ffmpeg -hide_banner -loglevel error -y -i "$ASSET_DIR/tray.png" "$ASSET_DIR/tray.ico"
