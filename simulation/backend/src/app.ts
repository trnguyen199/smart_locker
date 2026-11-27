import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { OtpService, DomainError } from "./services/otp.js";
import { validateTemperature } from "./services/temperature.js";
import { SimpleThermalModel, type ThermalModel } from "./simulation/thermal.js";
import { PhpBridge, type PhpKioskLocker } from "./phpBridge.js";
import { WokwiMqttBridge } from "./mqttBridge.js";
import type {
  BankStatus,
  GpioPinMap,
  LockerEvent,
  LockerStatus,
  Mode,
  Parcel,
} from "../../shared/types.js";

const ROWS = 3;
const COLUMNS = 3;
const HERE = path.dirname(fileURLToPath(import.meta.url));
function resolveFromRoot(rel: string): string {
  const candidates = [
    path.resolve(HERE, "../../..", rel),
    path.resolve(HERE, "../../../../..", rel),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}
const SIM_DIST_DIR = resolveFromRoot("simulation-dist");
const HARDWARE_DIR = resolveFromRoot("hardware");

const GPIO_BY_SLOT: Record<number, { nodeId: 1 | 2 | 3; lockerType: "THERMAL"; gpio: GpioPinMap }> = {
  1: { nodeId: 1, lockerType: "THERMAL", gpio: { servo_gpio: 13, door_switch_gpio: 32, ds18b20_gpio: 16, relay_gpio: 26 } },
  2: { nodeId: 1, lockerType: "THERMAL", gpio: { servo_gpio: 14, door_switch_gpio: 33, ds18b20_gpio: 17, relay_gpio: null } },
  3: { nodeId: 1, lockerType: "THERMAL", gpio: { servo_gpio: 27, door_switch_gpio: 25, ds18b20_gpio: 18, relay_gpio: 19 } },
  4: { nodeId: 2, lockerType: "THERMAL", gpio: { servo_gpio: 13, door_switch_gpio: 32, ds18b20_gpio: 16, relay_gpio: null } },
  5: { nodeId: 2, lockerType: "THERMAL", gpio: { servo_gpio: 14, door_switch_gpio: 33, ds18b20_gpio: 17, relay_gpio: 23 } },
  6: { nodeId: 2, lockerType: "THERMAL", gpio: { servo_gpio: 27, door_switch_gpio: 25, ds18b20_gpio: 18, relay_gpio: null } },
  7: { nodeId: 3, lockerType: "THERMAL", gpio: { servo_gpio: 13, door_switch_gpio: 32, ds18b20_gpio: 16, relay_gpio: 26 } },
  8: { nodeId: 3, lockerType: "THERMAL", gpio: { servo_gpio: 14, door_switch_gpio: 33, ds18b20_gpio: 17, relay_gpio: null } },
  9: { nodeId: 3, lockerType: "THERMAL", gpio: { servo_gpio: 27, door_switch_gpio: 25, ds18b20_gpio: 18, relay_gpio: 19 } },
};

interface Cell {
  id: string;
  slot: number;
  lockerType: "THERMAL" | "COOL" | "NORMAL";
  backendStatus: string;
  nodeId: 1 | 2 | 3;
  gpio: GpioPinMap;
  row: number;
  column: number;
  model: ThermalModel;
  otp: OtpService;
  mode: Mode;
  target: number;
  doorOpen: boolean;
  autoCloseAt: number | null;
  parcel: Parcel;
  lockoutUntil: number | null;
  lastTelemetrySentAt: number;
  localOverrideUntil: number;
  lastWokwiTempAt: number;
}

function deriveModeFromTarget(target: number): Mode {
  if (target >= 30) return "HEAT";
  if (target < 20) return "COOL";
  return "OFF";
}

export function createLockerServer({
  autoCloseMs = 30_000,
  enablePhpBridge = true,
  enableMqttBridge,
}: {
  autoCloseMs?: number;
  enablePhpBridge?: boolean;
  enableMqttBridge?: boolean;
} = {}) {
  const useMqtt = enableMqttBridge ?? enablePhpBridge;
  const app = express();
  const http = createServer(app);
  const php = new PhpBridge();
  let mqttBridge: WokwiMqttBridge | null = null;

  const allowed = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
  ]);
  const io = new Server(http, {
    cors: { origin: [...allowed] },
    allowRequest: (req, done) =>
      done(null, !req.headers.origin || allowed.has(req.headers.origin)),
  });
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin) {
      if (!allowed.has(origin)) {
        res.status(403).json({ message: "Origin không được phép." });
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "8kb" }));

  const cells: Cell[] = Array.from({ length: ROWS * COLUMNS }, (_, i) => {
    const slot = i + 1;
    const hw = GPIO_BY_SLOT[slot];
    const model = new SimpleThermalModel();
    model.temperature = 25.0;
    return {
      id: String(slot).padStart(2, "0"),
      slot,
      lockerType: hw.lockerType,
      backendStatus: "AVAILABLE",
      nodeId: hw.nodeId,
      gpio: hw.gpio,
      row: Math.floor(i / COLUMNS),
      column: i % COLUMNS,
      model,
      otp: new OtpService(),
      mode: "OFF",
      target: 25,
      doorOpen: false,
      autoCloseAt: null,
      parcel: "EMPTY",
      lockoutUntil: null,
      lastTelemetrySentAt: 0,
      localOverrideUntil: 0,
      lastWokwiTempAt: 0,
    };
  });

  const events: LockerEvent[] = [];
  const doorTimers = new Map<string, NodeJS.Timeout>();
  const vending: BankStatus["vending"] = [
    { id: "water", name: "Nước suối", kind: "DRINK", stock: 8 },
    { id: "tea", name: "Trà đóng chai", kind: "DRINK", stock: 6 },
    { id: "cookie", name: "Bánh quy", kind: "SNACK", stock: 6 },
    { id: "bar", name: "Thanh ngũ cốc", kind: "SNACK", stock: 6 },
  ];
  let revision = 0;
  let eventId = 0;

  const cellStatus = (c: Cell): LockerStatus => {
    const baseOtp = c.otp.status();
    return {
      id: c.id,
      slot: c.slot,
      lockerType: c.lockerType,
      backendStatus: c.backendStatus,
      nodeId: c.nodeId,
      gpio: c.gpio,
      row: c.row,
      column: c.column,
      temperature: c.model.temperature,
      ambient: 28,
      target: c.target,
      mode: c.mode,
      polarity: c.mode === "COOL" ? -1 : c.mode === "HEAT" ? 1 : 0,
      power: Math.abs(c.model.power),
      fan: c.mode !== "OFF" || Math.abs(c.model.power) > 0.02,
      doorOpen: c.doorOpen,
      autoCloseAt: c.autoCloseAt,
      locked: !c.doorOpen,
      parcel: c.parcel,
      otp: {
        ...baseOtp,
        blockedUntil: c.lockoutUntil ?? baseOtp.blockedUntil,
      },
    };
  };

  const status = (): BankStatus => ({
    revision,
    serverTime: Date.now(),
    rows: ROWS,
    columns: COLUMNS,
    phpConnected: php.connected,
    mqttConnected: mqttBridge?.connected ?? false,
    mqttTopicPrefix: mqttBridge?.topicPrefix ?? "",
    wokwiNodes: mqttBridge?.getOnlineNodes() ?? [],
    lockers: cells.map(cellStatus),
    vending: vending.map((item) => ({ ...item })),
  });

  const log = (c: Cell, type: string, message: string) => {
    const e = { id: ++eventId, at: Date.now(), lockerId: `TỦ ${c.id}`, type, message };
    events.unshift(e);
    events.length = Math.min(events.length, 200);
    io.emit("event", e);
  };

  const publish = (topic: string, c: Cell) => {
    revision++;
    if (topic !== "status") {
      io.emit(topic, { lockerId: c.id, locker: cellStatus(c), revision });
    }
    io.emit("status", status());
  };

  function getCell(id: string): Cell {
    const raw = id.trim().toUpperCase().replace(/^TỦ\s*/i, "").replace(/^T/i, "");
    const padded = /^\d+$/.test(raw) ? raw.padStart(2, "0") : raw;
    const cell = cells.find((c) => c.id === padded || String(c.slot) === raw);
    if (!cell) throw new DomainError("Không tìm thấy ngăn tủ.", 404);
    return cell;
  }

  function scheduleAutoClose(c: Cell) {
    c.autoCloseAt = Date.now() + autoCloseMs;
    const pending = doorTimers.get(c.id);
    if (pending) clearTimeout(pending);
    const autoClose = setTimeout(() => closeDoor(c, true), autoCloseMs);
    autoClose.unref();
    doorTimers.set(c.id, autoClose);
  }

  function pushWokwiCommand(c: Cell, cmd: "SYNC" | "UNLOCK" | "LOCK" | "SET_TEMP") {
    mqttBridge?.publishSlotCommand(c.nodeId, {
      cmd,
      slot: c.slot,
      door_open: c.doorOpen,
      mode: c.mode,
      target_temp: c.target,
      relay_on: c.gpio.relay_gpio !== null && c.mode === "COOL" && c.model.temperature > c.target - 0.3,
    });
  }

  function openDoor(c: Cell, reasonMessage: string, syncToPhp = true, syncToWokwi = true) {
    c.localOverrideUntil = Date.now() + 3500;
    if (!c.doorOpen) {
      c.doorOpen = true;
      c.backendStatus = "OPEN";
      log(c, "door", `Tủ ${c.id}: ${reasonMessage}`);
    }
    scheduleAutoClose(c);
    publish("door", c);
    if (syncToWokwi) pushWokwiCommand(c, "UNLOCK");
    if (syncToPhp && enablePhpBridge && php.connected) {
      void php.sendDoorEvent(c.slot, "DOOR_OPENED");
    }
  }

  function closeDoor(c: Cell, automatic = false, syncToPhp = true, syncToWokwi = true) {
    const pending = doorTimers.get(c.id);
    if (pending) clearTimeout(pending);
    doorTimers.delete(c.id);
    c.autoCloseAt = null;
    if (!c.doorOpen) return;
    c.localOverrideUntil = Date.now() + 3500;
    c.doorOpen = false;
    c.backendStatus = c.parcel === "LOADED" ? "OCCUPIED" : "AVAILABLE";
    log(
      c,
      "door",
      `Tủ ${c.id}: ${automatic ? "tự đóng sau 30 giây" : "đóng cửa"}, khóa lại`,
    );
    publish("door", c);
    if (syncToWokwi) pushWokwiCommand(c, "LOCK");
    if (syncToPhp && enablePhpBridge && php.connected) {
      void php.sendDoorEvent(c.slot, "DOOR_CLOSED", c.parcel === "LOADED");
    }
  }

  function buildLocalHardwareInfo() {
    const hasFirmware = (() => {
      if (!fs.existsSync(HARDWARE_DIR)) return false;
      const walk = (dir: string): boolean => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (walk(full)) return true;
          } else if (/\.(ino|cpp|c)$/i.test(entry.name) || entry.name.toLowerCase() === "platformio.ini") {
            return true;
          }
        }
        return false;
      };
      return walk(HARDWARE_DIR);
    })();

    const nodes = [1, 2, 3].map((nodeId) => {
      const diagPath = `hardware/node_${nodeId}/diagram.json`;
      const fullDiag = path.join(HARDWARE_DIR, `node_${nodeId}`, "diagram.json");
      const exists = fs.existsSync(fullDiag);
      let partsCount = 0;
      let connectionsCount = 0;
      const partSummary: Record<string, number> = {};
      let diagramData: { parts: unknown[]; connections: unknown[] } = { parts: [], connections: [] };
      if (exists) {
        try {
          const parsed = JSON.parse(fs.readFileSync(fullDiag, "utf8")) as {
            parts?: Array<{ type?: string }>;
            connections?: unknown[];
          };
          const parts = Array.isArray(parsed.parts) ? parsed.parts : [];
          const connections = Array.isArray(parsed.connections) ? parsed.connections : [];
          diagramData = { parts, connections };
          partsCount = parts.length;
          connectionsCount = connections.length;
          for (const p of parts) {
            if (p.type && p.type !== "wokwi-text") {
              partSummary[p.type] = (partSummary[p.type] || 0) + 1;
            }
          }
        } catch {}
      }
      const nodeCells = cells.filter((c) => c.nodeId === nodeId);
      const startSlot = (nodeId - 1) * 3 + 1;
      const endSlot = startSlot + 2;
      return {
        node: nodeId,
        title: `ESP32 Node ${nodeId} (Ngăn ${String(startSlot).padStart(2, "0")} – ${String(endSlot).padStart(2, "0")})`,
        diagram_path: diagPath,
        diagram_exists: exists,
        parts_count: partsCount,
        connections_count: connectionsCount,
        part_summary: partSummary,
        diagram: diagramData,
        slots: nodeCells.map((c) => ({
          slot: c.slot,
          code: `TỦ ${c.id}`,
          type: c.lockerType,
          gpio: { type: c.lockerType, ...c.gpio },
          signals: {
            servo_angle: c.doorOpen ? 90 : 0,
            door_switch: c.doorOpen ? "HIGH (Mở)" : "LOW (Đóng)",
            ds18b20_temp: Number(c.model.temperature.toFixed(1)),
            target_temp: c.target,
            relay_active: c.gpio.relay_gpio !== null && c.mode === "COOL" && Math.abs(c.model.power) > 0.05,
            pwm_power: Math.round(Math.abs(c.model.power) * 100),
            status: c.backendStatus,
          },
        })),
      };
    });

    return {
      ok: true,
      circuit_summary: {
        diagrams_present: nodes.every((n) => n.diagram_exists),
        diagram_count: nodes.filter((n) => n.diagram_exists).length,
        firmware_present: hasFirmware,
        firmware_files: [],
        note: hasFirmware
          ? "Đã có cả sơ đồ Wokwi và firmware ESP32."
          : "Đã có 3 sơ đồ mạch Wokwi (node_1, node_2, node_3 cho 9 ngăn) trong hardware/; chưa có file firmware (.ino) cho ESP32 nên phần mạch hiện đang đồng bộ tín hiệu GPIO từ Mô phỏng 3D & Backend.",
      },
      nodes,
      server_time: new Date().toISOString(),
    };
  }

  app.get("/api/status", (_req, res) => res.json(status()));
  app.get("/api/lockers", (_req, res) => res.json(status()));
  app.get("/api/events", (_req, res) => res.json(events));
  app.get("/api/hardware", async (_req, res) => {
    if (enablePhpBridge && php.connected) {
      const remote = await php.getHardwareInfo();
      if (remote) {
        res.json(remote);
        return;
      }
    }
    res.json(buildLocalHardwareInfo());
  });

  app.post("/api/vending/dispense", (req, res) => {
    const item = vending.find((v) => v.id === req.body?.id);
    if (!item) throw new DomainError("Sản phẩm không hợp lệ.");
    if (!item.stock) throw new DomainError("Sản phẩm đã hết.", 409);
    item.stock--;
    const e = {
      id: ++eventId,
      at: Date.now(),
      lockerId: "KIOSK",
      type: "vending",
      message: `Quầy bên cạnh: đã lấy ${item.name}`,
    };
    events.unshift(e);
    events.length = Math.min(events.length, 200);
    io.emit("event", e);
    revision++;
    io.emit("vending", status());
    io.emit("status", status());
    res.json({ item: { ...item }, status: status() });
  });

  app.post("/api/lockers/:id/temperature", (req, res) => {
    const c = getCell(req.params.id as string);
    const v = validateTemperature(req.body);
    c.mode = v.mode;
    if (v.target !== undefined) c.target = v.target;
    else if (v.mode === "OFF") c.target = 25;
    log(
      c,
      "mode",
      `Tủ ${c.id}: ${c.mode}${c.mode === "OFF" ? "" : ` · ${c.target}°C`}`,
    );
    publish("mode", c);
    pushWokwiCommand(c, "SET_TEMP");
    if (enablePhpBridge && php.connected) {
      void php.syncTelemetry({
        locker_id: c.slot,
        current_temp: Number(c.model.temperature.toFixed(1)),
        target_temp: c.target,
        humidity: 58,
        pwm_power: Math.round(Math.abs(c.model.power) * 100),
        door_locked: !c.doorOpen,
        has_item: c.parcel === "LOADED",
      });
    }
    res.json(cellStatus(c));
  });

  app.post("/api/lockers/:id/otp/generate", (req, res) => {
    const c = getCell(req.params.id as string);
    const otp = c.otp.generate();
    log(c, "otp", `Tủ ${c.id}: tạo mã OTP 5 phút`);
    publish("otp", c);
    res.json(otp);
  });

  app.post("/api/lockers/:id/otp/verify", async (req, res, next) => {
    const c = getCell(req.params.id as string);
    try {
      if (c.doorOpen)
        throw new DomainError(
          "Cửa đang mở. Hãy đóng cửa trước khi xác thực lần khác.",
          409,
        );
      const code = String(req.body?.code ?? "").trim();

      if (enablePhpBridge && php.connected) {
        const phpResult = await php.verifyOtp(c.slot, code);
        if (phpResult.ok) {
          c.lockoutUntil = null;
          openDoor(c, phpResult.message, false);
          void php.sendDoorEvent(c.slot, "ACK_CMD");
          res.json(cellStatus(c));
          return;
        }
        // Nếu người dùng tạo OTP nội bộ trong simulator thì cho fallback nếu không phải lỗi khóa/hết hạn
        if (phpResult.status === 423) {
          c.lockoutUntil = Date.now() + 60_000;
          publish("otp", c);
          throw new DomainError(phpResult.message, 423);
        }
        if (phpResult.status === 409 || phpResult.status === 410 || phpResult.status === 422) {
          throw new DomainError(phpResult.message, phpResult.status);
        }
        // Thử đối chiếu OTP demo cục bộ nếu có
        try {
          c.otp.verify(code);
          openDoor(c, "OTP hợp lệ, mở cửa", true);
          res.json(cellStatus(c));
          return;
        } catch {
          throw new DomainError(phpResult.message, phpResult.status);
        }
      }

      c.otp.verify(code);
      openDoor(c, "OTP hợp lệ, mở cửa", false);
      res.json(cellStatus(c));
    } catch (e) {
      log(c, "otp", `Tủ ${c.id}: xác thực OTP thất bại`);
      publish("otp", c);
      next(e);
    }
  });

  app.post("/api/lockers/:id/parcel", (req, res) => {
    const c = getCell(req.params.id as string);
    if (!c.doorOpen)
      throw new DomainError("Mở cửa trước khi đặt hoặc lấy hàng.", 409);
    if (req.body?.parcel !== "EMPTY" && req.body?.parcel !== "LOADED")
      throw new DomainError("Trạng thái hàng không hợp lệ.");
    if (c.parcel === req.body.parcel) {
      res.json(cellStatus(c));
      return;
    }
    const pickupOtp =
      !php.connected && req.body.parcel === "LOADED" ? c.otp.generate() : null;
    c.parcel = req.body.parcel;
    log(
      c,
      "parcel",
      `Tủ ${c.id}: ${c.parcel === "LOADED" ? "đã đặt hàng vào ngăn" : "đã lấy hàng ra"}`,
    );
    publish("parcel", c);
    if (pickupOtp) {
      log(c, "otp", `Tủ ${c.id}: cấp OTP nhận hàng 5 phút`);
      publish("otp", c);
    }
    if (enablePhpBridge && php.connected) {
      void php.syncTelemetry({
        locker_id: c.slot,
        current_temp: Number(c.model.temperature.toFixed(1)),
        humidity: 58,
        pwm_power: Math.round(Math.abs(c.model.power) * 100),
        door_locked: !c.doorOpen,
        has_item: c.parcel === "LOADED",
      });
    }
    res.json({ ...cellStatus(c), ...(pickupOtp ? { pickupOtp } : {}) });
  });

  app.post("/api/lockers/:id/door/open", (req, res) => {
    const c = getCell(req.params.id as string);
    openDoor(c, "mở cửa thủ công trên mô phỏng", true);
    res.json(cellStatus(c));
  });

  app.post("/api/lockers/:id/door/close", (req, res) => {
    const c = getCell(req.params.id as string);
    closeDoor(c, false, true);
    res.json(cellStatus(c));
  });

  if (fs.existsSync(SIM_DIST_DIR)) {
    app.use(express.static(SIM_DIST_DIR));
    app.get("/", (_req, res) => {
      res.sendFile(path.join(SIM_DIST_DIR, "index.html"));
    });
  }

  app.use((_req, res) =>
    res.status(404).json({ message: "Không tìm thấy endpoint." }),
  );

  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    const code =
      err instanceof DomainError
        ? err.statusCode
        : err.type === "entity.parse.failed"
          ? 400
          : err.status === 413
            ? 413
            : 500;
    res
      .status(code)
      .json({ message: code === 500 ? "Lỗi máy chủ." : err.message });
  };
  app.use(errors);

  io.on("connection", (s) => {
    s.emit("status", status());
    s.emit("events", events);
  });

  let previous = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const dt = (now - previous) / 1000;
    previous = now;
    const wallNow = Date.now();
    for (const c of cells) {
      if (wallNow - c.lastWokwiTempAt > 6000) {
        c.model.step(c.mode, c.target, dt, c.doorOpen);
      }
    }
    revision++;
    io.emit("temperature", status());
    io.emit("status", status());
  }, 1000);
  timer.unref();

  let bridgeTimer: NodeJS.Timeout | null = null;
  let syncCursor = 0;

  if (enablePhpBridge) {
    const applyPhpLocker = async (remote: PhpKioskLocker) => {
      const c = cells.find((x) => x.slot === remote.slot || x.id === String(remote.id).padStart(2, "0"));
      if (!c) return;

      let changed = false;
      if (c.backendStatus !== remote.status) {
        c.backendStatus = remote.status;
        changed = true;
      }

      const remoteParcel: Parcel = remote.has_item ? "LOADED" : "EMPTY";
      if (c.parcel !== remoteParcel && !c.doorOpen) {
        c.parcel = remoteParcel;
        changed = true;
      }

      if (remote.lockout_until) {
        const ts = Date.parse(remote.lockout_until);
        c.lockoutUntil = Number.isFinite(ts) && ts > Date.now() ? ts : null;
      } else {
        c.lockoutUntil = null;
      }

      const cmd = remote.pending_cmd;
      if (cmd === "UNLOCK_DROP" || cmd === "UNLOCK_PICKUP" || cmd === "REMOTE_UNLOCK" || cmd === "FORCE_OPEN") {
        c.target = remote.target_temp;
        c.mode = deriveModeFromTarget(remote.target_temp);
        openDoor(c, `nhận lệnh ${cmd} từ Web/Backend`, false);
        await php.sendDoorEvent(c.slot, "ACK_CMD");
      } else if (cmd === "SET_TEMP" || cmd === "CREATE_ORDER") {
        c.target = remote.target_temp;
        c.mode = deriveModeFromTarget(remote.target_temp);
        log(c, "mode", `Tủ ${c.id}: đồng bộ ${cmd} (${c.mode} · ${c.target}°C)`);
        publish("mode", c);
        pushWokwiCommand(c, "SET_TEMP");
        await php.sendDoorEvent(c.slot, "ACK_CMD");
      } else if (cmd === "REMOTE_LOCK") {
        c.parcel = "EMPTY";
        c.target = remote.target_temp;
        c.mode = deriveModeFromTarget(remote.target_temp);
        closeDoor(c, false, false);
        publish("status", c);
        await php.sendDoorEvent(c.slot, "ACK_CMD");
      } else if (Date.now() >= c.localOverrideUntil && !remote.door_locked && !c.doorOpen) {
        openDoor(c, "đồng bộ trạng thái mở cửa từ Web", false);
      } else if (Date.now() >= c.localOverrideUntil && remote.door_locked && c.doorOpen) {
        c.parcel = remoteParcel;
        closeDoor(c, false, false);
      } else if (Math.abs(c.target - remote.target_temp) >= 0.5 && (Date.now() - c.lastTelemetrySentAt > 4000)) {
        c.target = remote.target_temp;
        c.mode = deriveModeFromTarget(remote.target_temp);
        changed = true;
      }

      if (changed) {
        publish("status", c);
      }
    };

    let isPollingPhp = false;
    const pollPhp = async () => {
      if (isPollingPhp) return;
      isPollingPhp = true;
      try {
        const list = await php.getKioskState();
        if (!list) return;
        for (const remote of list) {
          await applyPhpLocker(remote);
        }
        // Đẩy telemetry định kỳ (xoay vòng 3 ngăn mỗi nhịp 0.7s để đủ 9 ngăn mỗi ~2.1s)
        for (let k = 0; k < 3; k++) {
          const c = cells[syncCursor % cells.length];
          syncCursor++;
          c.lastTelemetrySentAt = Date.now();
          void php.syncTelemetry({
            locker_id: c.slot,
            current_temp: Number(c.model.temperature.toFixed(1)),
            humidity: 58,
            pwm_power: Math.round(Math.abs(c.model.power) * 100),
            door_locked: !c.doorOpen,
            has_item: c.parcel === "LOADED",
          });
        }
      } finally {
        isPollingPhp = false;
      }
    };

    void pollPhp();
    bridgeTimer = setInterval(() => {
      void pollPhp();
    }, 700);
    bridgeTimer.unref();
  }

  let wokwiSyncTimer: NodeJS.Timeout | null = null;
  if (useMqtt) {
    mqttBridge = new WokwiMqttBridge({
      onWokwiNodeSeen: () => {
        revision++;
        io.emit("status", status());
      },
      onWokwiState: (payload) => {
        const c = cells.find((x) => x.slot === payload.slot);
        if (!c) return;
        let tempChanged = false;
        if (payload.event === "BOOT_SYNC") {
          pushWokwiCommand(c, "SYNC");
        }
        if (typeof payload.current_temp === "number" && Number.isFinite(payload.current_temp)) {
          c.lastWokwiTempAt = Date.now();
          if (Math.abs(c.model.temperature - payload.current_temp) >= 0.2) {
            c.model.temperature = payload.current_temp;
            tempChanged = true;
          }
        }
        if (typeof payload.door_open === "boolean") {
          if (payload.door_open && !c.doorOpen) {
            openDoor(c, `công tắc cửa Wokwi Node ${payload.node_id} mở`, true, false);
          } else if (!payload.door_open && c.doorOpen) {
            closeDoor(c, false, true, false);
          }
        }
        if (tempChanged) {
          revision++;
          io.emit("temperature", status());
          io.emit("status", status());
        }
        if (enablePhpBridge && php.connected) {
          void php.syncTelemetry({
            locker_id: c.slot,
            current_temp: Number(c.model.temperature.toFixed(1)),
            humidity: 58,
            pwm_power: Math.round(Math.abs(c.model.power) * 100),
            door_locked: !c.doorOpen,
            has_item: c.parcel === "LOADED",
          });
        }
      },
    });
    mqttBridge.start();

    wokwiSyncTimer = setInterval(() => {
      const online = mqttBridge?.getOnlineNodes() ?? [];
      const now = Date.now();
      for (const nodeId of online) {
        for (const c of cells) {
          if (c.nodeId === nodeId && now >= c.localOverrideUntil) {
            pushWokwiCommand(c, "SYNC");
          }
        }
      }
    }, 8000);
    wokwiSyncTimer.unref();
  }

  return {
    app,
    http,
    io,
    status,
    close: async () => {
      clearInterval(timer);
      if (bridgeTimer) clearInterval(bridgeTimer);
      if (wokwiSyncTimer) clearInterval(wokwiSyncTimer);
      await mqttBridge?.close();
      for (const pending of doorTimers.values()) clearTimeout(pending);
      doorTimers.clear();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
