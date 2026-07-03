import assert from "node:assert/strict";
import test from "node:test";
import { getSpriteViewportStyle } from "../apps/desktop/src/spriteLayout.js";

test("desktop sprite layout uses a clipped viewport matching one atlas cell", () => {
  const atlas = {
    cellWidth: 192,
    cellHeight: 208
  };

  assert.deepEqual(getSpriteViewportStyle(atlas), {
    width: 192,
    height: 208
  });
});
