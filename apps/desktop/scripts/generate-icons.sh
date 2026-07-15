#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DESKTOP_DIR=$(dirname "$SCRIPT_DIR")
ASSET_DIR="$DESKTOP_DIR/assets"
ICONSET_DIR="$ASSET_DIR/icon.iconset"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR" "$ICONSET_DIR"' EXIT

ffmpeg -hide_banner -loglevel error -y \
  -i "$ASSET_DIR/icon-source.png" \
  -vf "scale=1080:1080,crop=1024:1024,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='clip((260-hypot(max(260-X,0)+max(X-763,0),max(260-Y,0)+max(Y-763,0)))*255+128,0,255)'" \
  -frames:v 1 \
  "$ASSET_DIR/icon.png"
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
