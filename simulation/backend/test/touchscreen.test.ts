import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gridRect,
  keyRect,
  screenHit,
  uvToScreen,
  SCREEN_W,
  SCREEN_H,
  keys,
} from "../../frontend/src/scenes/touchscreen.js";

test("screen texture and touch use the same 9 cell rectangles", () => {
  for (let i = 0; i < 9; i++) {
    const r = gridRect(i);
    const x = r.x + r.w / 2,
      y = r.y + r.h / 2;
    const screen = uvToScreen({ x: x / SCREEN_W, y: 1 - y / SCREEN_H });
    assert.deepEqual(screenHit(screen.x, screen.y, "grid"), {
      type: "select",
      index: i,
    });
  }
  assert.equal(screenHit(0, 0, "grid"), null);
});

test("keypad touch boundaries match rendered keys, including delete and submit", () => {
  keys.forEach((key, i) => {
    const r = keyRect(i);
    assert.deepEqual(screenHit(r.x + r.w / 2, r.y + r.h / 2, "otp"), {
      type: "key",
      key,
    });
  });
  assert.deepEqual(screenHit(50, 130, "otp"), { type: "back" });
  assert.deepEqual(screenHit(300, 450, "open"), { type: "place" });
  assert.deepEqual(screenHit(300, 535, "open"), { type: "close" });
});
