export const SCREEN_W = 600;
export const SCREEN_H = 680;

export type Rect = { x: number; y: number; w: number; h: number };
export type ScreenAction =
  | { type: "select"; index: number }
  | { type: "back" }
  | { type: "key"; key: string }
  | { type: "place" }
  | { type: "close" };

export const keys = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "*",
  "0",
  "#",
];
export const gridRect = (i: number): Rect => ({
  x: 45 + (i % 6) * 86,
  y: 185 + Math.floor(i / 6) * 81,
  w: 76,
  h: 71,
});
export const keyRect = (i: number): Rect => ({
  x: 43 + (i % 3) * 176,
  y: 305 + Math.floor(i / 3) * 76,
  w: 160,
  h: 66,
});
export const backRect: Rect = { x: 31, y: 109, w: 58, h: 52 };
export const placeRect: Rect = { x: 65, y: 417, w: 470, h: 65 };
export const closeRect: Rect = { x: 65, y: 504, w: 470, h: 65 };
export const uvToScreen = (uv: { x: number; y: number }) => ({
  x: uv.x * SCREEN_W,
  y: (1 - uv.y) * SCREEN_H,
});
const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function screenHit(
  x: number,
  y: number,
  screen: "grid" | "otp" | "open",
): ScreenAction | null {
  if (screen === "grid") {
    for (let i = 0; i < 30; i++)
      if (contains(gridRect(i), x, y)) return { type: "select", index: i };
    return null;
  }
  if (contains(backRect, x, y)) return { type: "back" };
  if (screen === "open") {
    if (contains(placeRect, x, y)) return { type: "place" };
    if (contains(closeRect, x, y)) return { type: "close" };
    return null;
  }
  for (let i = 0; i < keys.length; i++)
    if (contains(keyRect(i), x, y)) return { type: "key", key: keys[i] };
  return null;
}
