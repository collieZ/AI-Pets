interface AtlasSize {
  cellWidth: number;
  cellHeight: number;
}

export interface SpriteViewportStyle {
  width: number;
  height: number;
}

export function getSpriteViewportStyle(atlas: AtlasSize, scale = 1): SpriteViewportStyle {
  return {
    width: Math.round(atlas.cellWidth * scale),
    height: Math.round(atlas.cellHeight * scale)
  };
}
