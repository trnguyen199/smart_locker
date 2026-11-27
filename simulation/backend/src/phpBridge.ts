import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV = [
  path.resolve(HERE, "../../../.env"),
  path.resolve(HERE, "../../../../../.env"),
].find((p) => fs.existsSync(p)) ?? path.resolve(HERE, "../../../.env");

function loadRootEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(ROOT_ENV)) return out;
  const lines = fs.readFileSync(ROOT_ENV, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    out[k] = v;
  }
  return out;
}

export interface PhpKioskLocker {
  id: number;
  slot: number;
  code: string;
  type: "COOL" | "NORMAL";
  status: string;
  current_temp: number;
  target_temp: number;
  humidity: number;
  pwm_power: number;
  door_locked: boolean;
  has_item: boolean;
  online: boolean;
  active_category: string | null;
  wrong_attempts: number;
  lockout_until: string | null;
  pending_cmd: string | null;
}

export class PhpBridge {
  readonly baseUrl: string;
  readonly deviceKey: string;
  connected = false;

  constructor() {
    const env = loadRootEnv();
    this.baseUrl = (process.env.PHP_BASE_URL || env.PHP_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    this.deviceKey = process.env.IOT_DEVICE_KEY || env.IOT_DEVICE_KEY || "";
  }

  private headers(withJson = false): Record<string, string> {
    return {
      Accept: "application/json",
      ...(withJson ? { "Content-Type": "application/json" } : {}),
      ...(this.deviceKey ? { "X-Device-Key": this.deviceKey } : {}),
    };
  }

  async getKioskState(): Promise<PhpKioskLocker[] | null> {
    if (!this.deviceKey) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api.php?action=kiosk_state`, {
        headers: this.headers(false),
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) {
        this.connected = false;
        return null;
      }
      const data = (await res.json()) as { ok?: boolean; lockers?: PhpKioskLocker[] };
      if (!data?.ok || !Array.isArray(data.lockers)) {
        this.connected = false;
        return null;
      }
      this.connected = true;
      return data.lockers;
    } catch {
      this.connected = false;
      return null;
    }
  }

  async getHardwareInfo(): Promise<unknown | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api.php?action=hardware_info`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async verifyOtp(slot: number, otp: string): Promise<{ ok: boolean; status: number; message: string; mode?: string }> {
    const res = await fetch(`${this.baseUrl}/api/verify_otp.php`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ locker_id: slot, otp }),
      signal: AbortSignal.timeout(4000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; mode?: string };
    return {
      ok: res.ok && Boolean(data.ok),
      status: res.status,
      message: data.message || data.error || "Xác thực OTP thất bại.",
      mode: data.mode,
    };
  }

  async sendDoorEvent(slot: number, event: "DOOR_OPENED" | "DOOR_CLOSED" | "ACK_CMD", hasItem?: boolean): Promise<boolean> {
    if (!this.deviceKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api.php?action=kiosk_door_event`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify({
          locker_id: slot,
          event,
          ...(typeof hasItem === "boolean" ? { has_item: hasItem } : {}),
        }),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async syncTelemetry(payload: {
    locker_id: number;
    current_temp: number;
    target_temp?: number;
    humidity: number;
    pwm_power: number;
    door_locked: boolean;
    has_item: boolean;
    ack_cmd?: boolean;
  }): Promise<boolean> {
    if (!this.deviceKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api.php?action=iot_sync`, {
        method: "POST",
        headers: this.headers(true),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
