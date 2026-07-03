interface AtlasSize {
  cellWidth: number;
  cellHeight: number;
}

export interface SpriteViewportStyle {
  width: number;
  height: number;
}

export function getSpriteViewportStyle(atlas: AtlasSize): SpriteViewportStyle {
  return {
    width: atlas.cellWidth,
    height: atlas.cellHeight
  };
}
