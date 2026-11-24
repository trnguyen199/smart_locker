import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { LockerStatus } from "../../../shared/types";
import {
  SCREEN_W,
  SCREEN_H,
  gridRect,
  keyRect,
  keys,
  backRect,
  placeRect,
  closeRect,
  screenHit,
  uvToScreen,
  type Rect,
} from "./touchscreen";

interface Props {
  lockers: LockerStatus[];
  kioskSelected: string | null;
  selected: string;
  code: string;
  screenFeedback: string;
  blocked: number;
  secondsToClose: number;
  disabled: boolean;
  onScreenSelect: (id: string) => void;
  onBack: () => void;
  onKey: (key: string) => void;
  onPlace: () => void;
  onClose: () => void;
}
function box(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  outline?: string,
) {
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
  ctx.fillStyle = color;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function label(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 20,
  color = "#e7f7fb",
  align: CanvasTextAlign = "center",
) {
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function centered(
  ctx: CanvasRenderingContext2D,
  value: string,
  r: Rect,
  size = 26,
  color?: string,
) {
  label(ctx, value, r.x + r.w / 2, r.y + r.h / 2, size, color);
}
function renderScreen(canvas: HTMLCanvasElement, props: Props) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const gradient = ctx.createLinearGradient(0, 0, SCREEN_W, SCREEN_H);
  gradient.addColorStop(0, "#173e55");
  gradient.addColorStop(0.64, "#0d263c");
  gradient.addColorStop(1, "#091d30");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.strokeStyle = "#598c9e";
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, SCREEN_W - 12, SCREEN_H - 12);
  label(ctx, "SMART LOCKER", 40, 63, 25, "#f2fbff", "left");
  label(ctx, "● TRỰC TUYẾN", 560, 63, 16, "#80dec3", "right");
  const locker = props.lockers.find((l) => l.id === props.selected);
  if (!props.kioskSelected) {
    label(ctx, "CHỌN NGĂN GỬI / NHẬN HÀNG", 300, 133, 24, "#a3e7f2");
    props.lockers.forEach((l, i) => {
      const available = !l.doorOpen;
      const r = gridRect(i);
      box(
        ctx,
        r,
        !available ? "#3a4150" : l.parcel === "LOADED" ? "#715342" : "#2a526b",
        l.parcel === "LOADED" ? "#ecad72" : "#5e93ab",
      );
      centered(ctx, l.id, r, 24, l.parcel === "LOADED" ? "#ffe2bb" : "#f1fbfe");
    });
    label(ctx, "XANH: GỬI HÀNG  ·  CAM: NHẬN HÀNG", 300, 634, 17, "#accbd5");
    return;
  }
  box(ctx, { x: 31, y: 109, w: 538, h: 59 }, "#28516a");
  centered(ctx, "‹", backRect, 39, "#a0e8f3");
  label(ctx, `NGĂN ${props.selected}`, 145, 138, 25, "#effaff", "left");
  label(
    ctx,
    locker?.parcel === "LOADED" ? "CÓ HÀNG" : "TRỐNG",
    548,
    138,
    18,
    "#94dbe9",
    "right",
  );
  if (locker?.doorOpen) {
    const pickup = locker.parcel === "LOADED";
    label(ctx, "CỬA ĐÃ MỞ", 300, 272, 44, "#7ce6c2");
    label(
      ctx,
      `${pickup ? "Lấy hàng khỏi" : "Bỏ hàng vào"} ngăn ${props.selected}`,
      300,
      337,
      24,
    );
    label(
      ctx,
      `Tự đóng sau ${props.secondsToClose} giây`,
      300,
      380,
      22,
      "#bce1e9",
    );
    box(ctx, placeRect, "#178c9c", "#5bd9d9");
    centered(ctx, pickup ? "ĐÃ LẤY HÀNG" : "ĐÃ BỎ HÀNG", placeRect, 26);
    box(ctx, closeRect, "#294c63", "#79acbd");
    centered(ctx, "ĐÓNG CỬA NGAY", closeRect, 26);
    return;
  }
  label(
    ctx,
    props.code.replace(/./g, "●").padEnd(6, "○"),
    300,
    216,
    37,
    "#a2edf3",
  );
  const feedback =
    props.blocked > 0 ? `TẠM KHÓA ${props.blocked} GIÂY` : props.screenFeedback;
  label(
    ctx,
    feedback.slice(0, 42),
    300,
    268,
    17,
    props.blocked ? "#ffc09b" : "#b9d8e1",
  );
  keys.forEach((key, i) => {
    const r = keyRect(i);
    box(
      ctx,
      r,
      key === "#" ? "#138d9c" : "#2b546d",
      key === "#" ? "#5fe1df" : "#598ca5",
    );
    centered(ctx, key, r, 34);
  });
  label(ctx, "* XÓA  ·  # XÁC NHẬN", 300, 637, 18, "#a8cbd6");
}

export default function TouchDisplay(props: Props) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, []);
  useEffect(() => {
    renderScreen(texture.image as HTMLCanvasElement, props);
    texture.needsUpdate = true;
  }, [texture, props]);
  useEffect(() => () => texture.dispose(), [texture]);

  function press(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    if (!e.uv || props.disabled) return;
    const { x, y } = uvToScreen(e.uv);
    const locker = props.lockers.find((l) => l.id === props.selected);
    const view = !props.kioskSelected
      ? "grid"
      : locker?.doorOpen
        ? "open"
        : "otp";
    const action = screenHit(x, y, view);
    if (!action) return;
    if (action.type === "select") {
      const chosen = props.lockers[action.index];
      if (chosen && !chosen.doorOpen) props.onScreenSelect(chosen.id);
    } else if (action.type === "back") props.onBack();
    else if (action.type === "key" && props.blocked === 0)
      props.onKey(action.key);
    else if (action.type === "place") props.onPlace();
    else if (action.type === "close") props.onClose();
  }
  return (
    <mesh
      position={[0, 1.52, 0.31]}
      onPointerDown={press}
      onPointerOver={() => {
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <planeGeometry args={[1.62, 1.8]} />
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
