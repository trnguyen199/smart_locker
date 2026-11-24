import type { Mode } from "../../../shared/types.js";
import { DomainError } from "./otp.js";
export function validateTemperature(body: unknown): {
  mode: Mode;
  target?: number;
} {
  if (!body || typeof body !== "object")
    throw new DomainError("Cần gửi chế độ nhiệt hợp lệ.");
  const b = body as Record<string, unknown>;
  if (b.mode !== "COOL" && b.mode !== "HEAT" && b.mode !== "OFF")
    throw new DomainError("Chế độ phải là COOL, HEAT hoặc OFF.");
  if (b.mode === "OFF") return { mode: b.mode };
  if (
    typeof b.target !== "number" ||
    !Number.isFinite(b.target) ||
    b.target < (b.mode === "COOL" ? 5 : 30) ||
    b.target > (b.mode === "COOL" ? 20 : 45)
  )
    throw new DomainError(
      b.mode === "COOL" ? "COOL cho phép 5–20°C." : "HEAT cho phép 30–45°C.",
    );
  return { mode: b.mode, target: b.target };
}
