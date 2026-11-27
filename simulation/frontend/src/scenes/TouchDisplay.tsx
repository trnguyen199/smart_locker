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
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fillStyle = color;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.5;
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
  label(ctx, "SMART LOCKER · 9 NGĂN", 40, 63, 24, "#f2fbff", "left");
  label(ctx, "● TRỰC TUYẾN", 560, 63, 16, "#80dec3", "right");

  const locker = props.lockers.find((l) => l.id === props.selected);
  if (!props.kioskSelected) {
    label(ctx, "CHỌN NGĂN NHẬP OTP MỞ CỬA", 300, 133, 22, "#a3e7f2");
    props.lockers.slice(0, 9).forEach((l, i) => {
      const available = !l.doorOpen;
      const isOccupied = l.parcel === "LOADED" || l.backendStatus === "OCCUPIED";
      const isWaiting = l.backendStatus === "WAITING_DROP";
      const r = gridRect(i);
      const fill = !available
        ? "#185b52"
        : isOccupied
          ? "#715342"
          : isWaiting
            ? "#1e5c78"
            : "#2a526b";
      const border = !available
        ? "#67e8c9"
        : isOccupied
          ? "#ecad72"
          : isWaiting
            ? "#60d7f6"
            : "#5e93ab";
      box(ctx, r, fill, border);
      label(ctx, `TỦ ${l.id}`, r.x + r.w / 2, r.y + 38, 26, "#f1fbfe");
      label(
        ctx,
        `${l.temperature.toFixed(1)}°C`,
        r.x + r.w / 2,
        r.y + 71,
        16,
        "#bde7f5",
      );
      label(
        ctx,
        l.doorOpen ? "ĐANG MỞ" : isOccupied ? "CÓ HÀNG" : isWaiting ? "CHỜ GỬI" : "TRỐNG",
        r.x + r.w / 2,
        r.y + 98,
        14,
        isOccupied ? "#ffd9aa" : "#80dec3",
      );
    });
    label(ctx, "CHẠM Ô TỦ ĐỂ NHẬP OTP · * XÓA · # MỞ CỬA", 300, 634, 16, "#accbd5");
    return;
  }

  box(ctx, { x: 31, y: 109, w: 538, h: 59 }, "#28516a");
  centered(ctx, "‹", backRect, 39, "#a0e8f3");
  label(ctx, `TỦ ${props.selected}`, 115, 138, 24, "#effaff", "left");
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
      `${pickup ? "Lấy hàng khỏi" : "Bỏ hàng vào"} Tủ ${props.selected}`,
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
  label(ctx, "* XÓA  ·  # XÁC NHẬN OTP", 300, 637, 18, "#a8cbd6");
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
      if (chosen) props.onScreenSelect(chosen.id);
    } else if (action.type === "back") props.onBack();
    else if (action.type === "key" && props.blocked === 0)
      props.onKey(action.key);
    else if (action.type === "place") props.onPlace();
    else if (action.type === "close") props.onClose();
  }
  return (
    <mesh
      position={[0, 1.25, 0.31]}
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
