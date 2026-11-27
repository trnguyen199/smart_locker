import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mqtt, { type MqttClient } from "mqtt";
import type { Mode } from "../../shared/types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV =
  [
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
    out[t.slice(0, eq).trim()] = t
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return out;
}

export interface WokwiStatePayload {
  node_id: number;
  slot: number;
  door_open?: boolean;
  door_locked?: boolean;
  current_temp?: number;
  relay_on?: boolean;
  event?: string;
}

export interface MqttHandlers {
  onWokwiState: (payload: WokwiStatePayload) => void;
  onWokwiNodeSeen: (nodeId: number) => void;
}

export class WokwiMqttBridge {
  readonly brokerUrl: string;
  readonly topicPrefix: string;
  private client: MqttClient | null = null;
  private nodeLastSeen = new Map<number, number>();
  connected = false;

  constructor(private readonly handlers: MqttHandlers) {
    const env = loadRootEnv();
    this.brokerUrl =
      process.env.MQTT_TCP_URL ||
      env.MQTT_TCP_URL ||
      "mqtt://broker.emqx.io:1883";
    this.topicPrefix =
      process.env.MQTT_TOPIC_PREFIX ||
      env.MQTT_TOPIC_PREFIX ||
      "uth/iot/smartlocker/nhom4_trnguyen199";
  }

  start(): void {
    if (this.client) return;
    const clientId = `sl_sim_${Math.random().toString(16).slice(2, 10)}`;
    this.client = mqtt.connect(this.brokerUrl, {
      clientId,
      clean: true,
      reconnectPeriod: 4000,
      connectTimeout: 8000,
    });

    this.client.on("connect", () => {
      this.connected = true;
      this.client?.subscribe(`${this.topicPrefix}/wokwi/+/state`, { qos: 1 });
      this.client?.subscribe(`${this.topicPrefix}/wokwi/+/heartbeat`, {
        qos: 0,
      });
    });

    this.client.on("close", () => {
      this.connected = false;
    });

    this.client.on("offline", () => {
      this.connected = false;
    });

    this.client.on("error", () => {
      this.connected = false;
    });

    this.client.on("message", (topic, buf) => {
      try {
        const msg = JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
        const nodeMatch = topic.match(/\/wokwi\/node_(\d+)\//);
        const nodeId = Number(msg.node_id ?? nodeMatch?.[1] ?? 0);
        if (nodeId >= 1 && nodeId <= 3) {
          this.nodeLastSeen.set(nodeId, Date.now());
          this.handlers.onWokwiNodeSeen(nodeId);
        }
        if (topic.endsWith("/state") && typeof msg.slot === "number") {
          this.handlers.onWokwiState({
            node_id: nodeId,
            slot: Number(msg.slot),
            door_open:
              typeof msg.door_open === "boolean" ? msg.door_open : undefined,
            door_locked:
              typeof msg.door_locked === "boolean"
                ? msg.door_locked
                : undefined,
            current_temp:
              typeof msg.current_temp === "number"
                ? msg.current_temp
                : undefined,
            relay_on:
              typeof msg.relay_on === "boolean" ? msg.relay_on : undefined,
            event: typeof msg.event === "string" ? msg.event : undefined,
          });
        }
      } catch {
        // Bỏ qua gói MQTT lỗi định dạng
      }
    });
  }

  getOnlineNodes(): number[] {
    const cutoff = Date.now() - 18_000;
    const active: number[] = [];
    for (const [nodeId, ts] of this.nodeLastSeen.entries()) {
      if (ts >= cutoff) active.push(nodeId);
    }
    return active.sort((a, b) => a - b);
  }

  publishSlotCommand(
    nodeId: number,
    payload: {
      cmd: "SYNC" | "UNLOCK" | "LOCK" | "SET_TEMP";
      slot: number;
      door_open: boolean;
      mode: Mode;
      target_temp: number;
      relay_on: boolean;
    },
  ): void {
    if (!this.client || !this.connected) return;
    const body = JSON.stringify(payload);
    this.client.publish(`${this.topicPrefix}/wokwi/node_${nodeId}/cmd`, body, {
      qos: 1,
      retain: false,
    });
  }

  async close(): Promise<void> {
    if (!this.client) return;
    const c = this.client;
    this.client = null;
    this.connected = false;
    await new Promise<void>((resolve) => {
      c.end(true, () => resolve());
    });
  }
}
