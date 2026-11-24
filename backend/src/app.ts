import express, { type ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { OtpService, DomainError } from "./services/otp.js";
import { validateTemperature } from "./services/temperature.js";
import { SimpleThermalModel, type ThermalModel } from "./simulation/thermal.js";
import type {
  BankStatus,
  LockerEvent,
  LockerStatus,
  Mode,
  Parcel,
} from "../../shared/types.js";

const ROWS = 5,
  COLUMNS = 6;
interface Cell {
  id: string;
  row: number;
  column: number;
  model: ThermalModel;
  otp: OtpService;
  mode: Mode;
  target: number;
  doorOpen: boolean;
  autoCloseAt: number | null;
  parcel: Parcel;
}
export function createLockerServer({ autoCloseMs = 30_000 } = {}) {
  const app = express(),
    http = createServer(app);
  const allowed = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ]);
  const io = new Server(http, {
    cors: { origin: [...allowed] },
    allowRequest: (req, done) =>
      done(null, !req.headers.origin || allowed.has(req.headers.origin)),
  });
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.headers.origin && !allowed.has(req.headers.origin)) {
      res.status(403).json({ message: "Origin không được phép." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "4kb" }));
  const cells: Cell[] = Array.from({ length: ROWS * COLUMNS }, (_, i) => ({
    id: `${String.fromCharCode(65 + Math.floor(i / COLUMNS))}${(i % COLUMNS) + 1}`,
    row: Math.floor(i / COLUMNS),
    column: i % COLUMNS,
    model: new SimpleThermalModel(),
    otp: new OtpService(),
    mode: "OFF",
    target: 15,
    doorOpen: false,
    autoCloseAt: null,
    parcel: "EMPTY",
  }));
  const events: LockerEvent[] = [];
  const doorTimers = new Map<string, NodeJS.Timeout>();
  const vending: BankStatus["vending"] = [
    { id: "water", name: "Nước suối", kind: "DRINK", stock: 8 },
    { id: "tea", name: "Trà đóng chai", kind: "DRINK", stock: 6 },
    { id: "cookie", name: "Bánh quy", kind: "SNACK", stock: 6 },
    { id: "bar", name: "Thanh ngũ cốc", kind: "SNACK", stock: 6 },
  ];
  let revision = 0,
    eventId = 0;
  const cellStatus = (c: Cell): LockerStatus => ({
    id: c.id,
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
    otp: c.otp.status(),
  });
  const status = (): BankStatus => ({
    revision,
    serverTime: Date.now(),
    rows: ROWS,
    columns: COLUMNS,
    lockers: cells.map(cellStatus),
    vending: vending.map((item) => ({ ...item })),
  });
  const log = (c: Cell, type: string, message: string) => {
    const e = { id: ++eventId, at: Date.now(), lockerId: c.id, type, message };
    events.unshift(e);
    events.length = Math.min(events.length, 200);
    io.emit("event", e);
  };
  const publish = (topic: string, c: Cell) => {
    revision++;
    io.emit(topic, { lockerId: c.id, locker: cellStatus(c), revision });
    io.emit("status", status());
  };
  function getCell(id: string): Cell {
    const cell = cells.find((c) => c.id === id.toUpperCase());
    if (!cell) throw new DomainError("Không tìm thấy ngăn tủ.", 404);
    return cell;
  }
  function closeDoor(c: Cell, automatic = false) {
    const pending = doorTimers.get(c.id);
    if (pending) clearTimeout(pending);
    doorTimers.delete(c.id);
    c.autoCloseAt = null;
    if (!c.doorOpen) return;
    c.doorOpen = false;
    log(
      c,
      "door",
      `${c.id}: ${automatic ? "tự đóng sau 30 giây" : "đóng cửa"}, khóa lại`,
    );
    publish("door", c);
  }
  app.get("/api/status", (_req, res) => res.json(status()));
  app.get("/api/lockers", (_req, res) => res.json(status()));
  app.get("/api/events", (_req, res) => res.json(events));
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
    const c = getCell(req.params.id as string),
      v = validateTemperature(req.body);
    c.mode = v.mode;
    if (v.target !== undefined) c.target = v.target;
    log(
      c,
      "mode",
      `${c.id}: ${c.mode}${c.mode === "OFF" ? "" : ` · ${c.target}°C`}`,
    );
    publish("mode", c);
    res.json(cellStatus(c));
  });
  app.post("/api/lockers/:id/otp/generate", (req, res) => {
    const c = getCell(req.params.id as string),
      otp = c.otp.generate();
    log(c, "otp", `${c.id}: tạo OTP 5 phút`);
    publish("otp", c);
    res.json(otp);
  });
  app.post("/api/lockers/:id/otp/verify", (req, res, next) => {
    const c = getCell(req.params.id as string);
    try {
      if (c.doorOpen)
        throw new DomainError(
          "Cửa đang mở. Hãy đóng cửa trước khi xác thực lần khác.",
          409,
        );
      c.otp.verify(req.body?.code);
      c.doorOpen = true;
      c.autoCloseAt = Date.now() + autoCloseMs;
      const pending = doorTimers.get(c.id);
      if (pending) clearTimeout(pending);
      const autoClose = setTimeout(() => closeDoor(c, true), autoCloseMs);
      autoClose.unref();
      doorTimers.set(c.id, autoClose);
      log(c, "door", `${c.id}: OTP hợp lệ, mở cửa`);
      publish("otp", c);
      publish("door", c);
      res.json(cellStatus(c));
    } catch (e) {
      log(c, "otp", `${c.id}: xác thực thất bại`);
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
    // Chỉ phản hồi này chứa mã nhận hàng; status và Socket.IO không bao giờ phát mã.
    const pickupOtp = req.body.parcel === "LOADED" ? c.otp.generate() : null;
    c.parcel = req.body.parcel;
    log(
      c,
      "parcel",
      `${c.id}: ${c.parcel === "LOADED" ? "đã đặt hàng" : "đã lấy hàng"}`,
    );
    publish("parcel", c);
    if (pickupOtp) {
      log(c, "otp", `${c.id}: cấp OTP nhận hàng 5 phút`);
      publish("otp", c);
    }
    res.json({ ...cellStatus(c), ...(pickupOtp ? { pickupOtp } : {}) });
  });
  app.post("/api/lockers/:id/door/close", (req, res) => {
    const c = getCell(req.params.id as string);
    closeDoor(c);
    res.json(cellStatus(c));
  });
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
    const now = performance.now(),
      dt = (now - previous) / 1000;
    previous = now;
    for (const c of cells) c.model.step(c.mode, c.target, dt, c.doorOpen);
    revision++;
    io.emit("temperature", status());
    io.emit("status", status());
  }, 1000);
  timer.unref();
  return {
    app,
    http,
    io,
    status,
    close: async () => {
      clearInterval(timer);
      for (const pending of doorTimers.values()) clearTimeout(pending);
      doorTimers.clear();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
