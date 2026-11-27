import { useEffect, useRef, useState } from "react";
import {
  Box,
  CircleHelp,
  Cpu,
  DoorOpen,
  Fan,
  Flame,
  GlassWater,
  KeyRound,
  Lock,
  Package,
  Radio,
  Snowflake,
  Thermometer,
} from "lucide-react";
import type { Mode } from "../../shared/types";
import LockerScene from "./scenes/LockerScene";
import { request, useLocker } from "./hooks/useLocker";

export default function App() {
  const { state, events, connected } = useLocker();
  const isEmbed =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("embed") === "1";

  const [selected, setSelected] = useState("01");
  const [kioskSelected, setKioskSelected] = useState<string | null>(null);
  const [focusScreen, setFocusScreen] = useState(false);
  const [mode, setMode] = useState<Mode>("OFF");
  const [target, setTarget] = useState(25);
  const [code, setCode] = useState("");
  const [screenFeedback, setScreenFeedback] = useState("Nhập OTP đã được cấp");
  const [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(
    null,
  );
  const [message, setMessage] = useState("Chọn một ngăn trên dàn tủ 3×3 để điều khiển.");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const openedOnScreen = useRef<string | null>(null);

  const locker = state?.lockers?.find((l) => l.id === selected);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setCode("");
    setIssued(null);
    if (locker) {
      setMode(locker.mode);
      setTarget(locker.target);
    }
  }, [selected]);

  useEffect(() => {
    if (locker && !locker.otp.active) setIssued(null);
  }, [locker?.otp.active]);

  useEffect(() => {
    if (locker && !locker.doorOpen && openedOnScreen.current === locker.id) {
      openedOnScreen.current = null;
      setKioskSelected(null);
    }
  }, [locker?.doorOpen, locker?.id]);

  const offset = (state?.serverTime ?? now) - now;
  const remaining = Math.max(
    0,
    Math.ceil(((issued?.expiresAt ?? 0) - now - offset) / 1000),
  );
  const blocked = Math.max(
    0,
    Math.ceil(((locker?.otp.blockedUntil ?? 0) - now - offset) / 1000),
  );
  const secondsToClose = Math.max(
    0,
    Math.ceil(((locker?.autoCloseAt ?? 0) - now - offset) / 1000),
  );

  async function act(fn: () => Promise<void>) {
    if (busy || !connected) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const text = e instanceof Error ? e.message : "Không gửi được lệnh.";
      setMessage(text);
      setScreenFeedback(text);
    } finally {
      setBusy(false);
    }
  }

  const post = <T,>(path: string, body: unknown) =>
    request<T>(`lockers/${selected}/${path}`, body);

  async function verify() {
    if (code.length !== 6) {
      setMessage("Nhập đủ 6 chữ số OTP.");
      setScreenFeedback("Nhập đủ 6 chữ số OTP");
      return;
    }
    await act(async () => {
      await post("otp/verify", { code });
      setCode("");
      setIssued(null);
      openedOnScreen.current = selected;
      setScreenFeedback("OTP hợp lệ");
      setMessage(`Tủ ${selected}: OTP hợp lệ, cửa đã mở.`);
    });
  }

  function key(k: string) {
    if (k === "*") setCode("");
    else if (k === "#") void verify();
    else setCode((v) => (v + k).slice(0, 6));
  }

  async function updateParcel() {
    if (!locker?.doorOpen) return;
    if (locker.parcel === "EMPTY") {
      const result = await post<{
        pickupOtp?: { code: string; expiresAt: number };
      }>("parcel", { parcel: "LOADED" });
      if (result.pickupOtp) setIssued(result.pickupOtp);
      setMessage(
        result.pickupOtp
          ? `Tủ ${selected}: đã đặt hàng. OTP nhận hàng hiện trên bảng điều khiển.`
          : `Tủ ${selected}: đã đặt hàng và đồng bộ trạng thái về Backend.`,
      );
    } else {
      await post("parcel", { parcel: "EMPTY" });
      await post("door/close", {});
      setKioskSelected(null);
      setIssued(null);
      setMessage(`Tủ ${selected}: đã lấy hàng và đóng cửa.`);
    }
  }

  const counts = {
    loaded: state?.lockers.filter((l) => l.parcel === "LOADED").length ?? 0,
    open: state?.lockers.filter((l) => l.doorOpen).length ?? 0,
    cooling: state?.lockers.filter((l) => l.mode === "COOL").length ?? 0,
  };
  const wokwiOnline = state?.wokwiNodes ?? [];

  return (
    <main className={`app ${isEmbed ? "app-embed" : ""}`}>
      {!isEmbed && (
        <header className="header">
          <div className="logo">
            <Box size={24} />
          </div>
          <div>
            <h1>Tủ nhận đồ thông minh</h1>
          </div>
        </header>
      )}

      <div className="sim-toolbar">
        <div className="wokwi-status-strip">
          <span className={`connection ${state?.mqttConnected ? "online" : ""}`}>
            <Cpu size={14} />
            {state?.mqttConnected
              ? wokwiOnline.length > 0
                ? `Wokwi MQTT: ${wokwiOnline.length}/3 Node online (${wokwiOnline.map((n) => `Node ${n}`).join(", ")})`
                : "Wokwi MQTT: Đang chờ ESP32 từ wokwi.com"
              : "Wokwi MQTT: Đang kết nối broker.emqx.io..."}
          </span>
        </div>
        <div className={`connection ${connected ? "online" : ""}`} role="status">
          <i />
          {connected
            ? state?.phpConnected
              ? "Đồng bộ Web/DB: Đang kết nối"
              : "Mô phỏng 3D: Hoạt động (Độc lập)"
            : "Mất kết nối Simulator"}
        </div>
      </div>

      <section className="summary" aria-label="Tổng quan">
        <div>
          <span>Tổng ngăn tủ</span>
          <strong>09</strong>
        </div>
        <div>
          <span>Đang chứa hàng</span>
          <strong>{counts.loaded.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Cửa đang mở</span>
          <strong>{counts.open.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Đang điều nhiệt</span>
          <strong>
            {(state?.lockers.filter((l) => l.mode !== "OFF").length ?? 0)
              .toString()
              .padStart(2, "0")}
          </strong>
          <small>nóng / lạnh</small>
        </div>
      </section>

      <div className="layout">
        <section className="stage card">
          <div className="section-head">
            <div>
              <h2>Quan sát cửa, nhiệt độ &amp; màn hình Kiosk</h2>
            </div>
          </div>
          {state ? (
            <LockerScene
              lockers={state.lockers}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                setKioskSelected(null);
              }}
              kioskSelected={kioskSelected}
              onScreenSelect={(id) => {
                setSelected(id);
                setCode("");
                setScreenFeedback("Nhập OTP đã được cấp");
                setKioskSelected(id);
              }}
              onBack={() => {
                setKioskSelected(null);
                setCode("");
              }}
              code={code}
              screenFeedback={screenFeedback}
              onKey={(k) => {
                if (!busy && connected && blocked === 0) key(k);
              }}
              vending={state.vending}
              blocked={blocked}
              secondsToClose={secondsToClose}
              focusScreen={focusScreen}
              onToggleFocus={() => setFocusScreen((v) => !v)}
              onPlace={() => void act(updateParcel)}
              onClose={() =>
                void act(async () => {
                  await post("door/close", {});
                  setKioskSelected(null);
                  setMessage(`Tủ ${selected}: đã đóng và khóa cửa.`);
                })
              }
              disabled={busy || !connected}
              onDispense={(id) =>
                void act(async () => {
                  await request("vending/dispense", { id });
                  setMessage("Quầy shipper: đã lấy một món.");
                })
              }
            />
          ) : (
            <div className="scene-empty">Đang kết nối mô phỏng…</div>
          )}
          <div className="legend">
            <span>
              <i className="dot blue" /> Làm lạnh
            </span>
            <span>
              <i className="dot red" /> Làm nóng
            </span>
            <span>
              <i className="dot brown" /> Có hàng
            </span>
            <span>Viền xanh: ngăn đang chọn</span>
          </div>
        </section>

          <aside className="controls">
          <section className="card detail">
            <div className="section-head">
              <div>
                <h2>Tủ {selected}</h2>
              </div>
              <span className={`state-pill ${locker?.doorOpen ? "open" : ""}`}>
                {locker?.doorOpen ? "CỬA MỞ" : "ĐÃ KHÓA"}
              </span>
            </div>
            <div className="status-grid">
              <div>
                <Thermometer size={18} />
                <span>Nhiệt độ</span>
                <b>{locker?.temperature.toFixed(1) ?? "--"}°C</b>
              </div>
              <div>
                <Package size={18} />
                <span>Hàng hóa</span>
                <b>{locker?.parcel === "LOADED" ? "Có hàng" : "Trống"}</b>
              </div>
              <div>
                <Fan size={18} />
                <span>Quạt / Relay</span>
                <b>{locker?.fan ? "Đang chạy" : "Tắt"}</b>
              </div>
              <div>
                <Radio size={18} />
                <span>Servo chốt</span>
                <b>{locker?.doorOpen ? "90° (Mở)" : "0° (Khóa)"}</b>
              </div>
            </div>

            <div className="door-demo-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy || !connected || Boolean(locker?.doorOpen)}
                onClick={() =>
                  void act(async () => {
                    await post("door/open", {});
                    setMessage(`Tủ ${selected}: đã mở cửa.`);
                  })
                }
              >
                <DoorOpen size={16} /> Mở cửa ngay
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || !connected || !locker?.doorOpen}
                onClick={() =>
                  void act(async () => {
                    await post("door/close", {});
                    setMessage(`Tủ ${selected}: đã đóng & khóa cửa.`);
                  })
                }
              >
                <Lock size={16} /> Đóng cửa
              </button>
            </div>

            {locker?.doorOpen && (
              <div className="open-actions" style={{ marginBottom: 12 }}>
                <button type="button" onClick={() => void act(updateParcel)}>
                  {locker.parcel === "EMPTY"
                    ? "Đặt hàng vào ngăn"
                    : "Lấy hàng ra"}
                </button>
              </div>
            )}

            <div
              className={`thermal-live ${locker?.mode.toLowerCase() ?? "off"}`}
              role="status"
            >
              <div className="thermal-live-head">
                <span className="thermal-live-icon">
                  {locker?.mode === "COOL" ? (
                    <Snowflake size={20} />
                  ) : locker?.mode === "HEAT" ? (
                    <Flame size={20} />
                  ) : (
                    <Thermometer size={20} />
                  )}
                </span>
                <div>
                  <b>
                    {locker?.mode === "COOL"
                      ? "Đang làm lạnh"
                      : locker?.mode === "HEAT"
                        ? "Đang làm nóng"
                        : "Đang cân bằng nhiệt"}
                  </b>
                  <small>
                    {locker?.mode === "OFF"
                      ? "Trở về nhiệt độ môi trường"
                      : `Mục tiêu ${locker?.target}°C · hiện tại ${locker?.temperature.toFixed(1)}°C`}
                  </small>
                </div>
                <span className="thermal-live-pulse" />
              </div>
              <div className="thermal-live-track">
                <span
                  style={{
                    width: `${locker?.mode === "OFF" ? 0 : Math.max(12, Math.min(100, (locker?.power ?? 0) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div className="cell-chooser cell-chooser-9" aria-label="Chọn ngăn tủ">
              {state?.lockers.map((l) => (
                <button
                  key={l.id}
                  aria-label={`Chọn Tủ ${l.id}`}
                  aria-pressed={selected === l.id}
                  className={selected === l.id ? "active" : ""}
                  onClick={() => setSelected(l.id)}
                >
                  Tủ {l.id}
                </button>
              ))}
            </div>
          </section>

          <section className="card form-card">
            <div className="subhead">
              <Thermometer size={19} />
              <h3>Điều chỉnh nhiệt độ</h3>
            </div>
            <div className="mode-buttons">
              {(["COOL", "HEAT", "OFF"] as Mode[]).map((m) => (
                <button
                  key={m}
                  className={mode === m ? "active" : ""}
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setTarget(m === "HEAT" ? 45 : m === "COOL" ? 8 : 25);
                  }}
                >
                  {m === "COOL" ? (
                    <Snowflake size={16} />
                  ) : m === "HEAT" ? (
                    <Flame size={16} />
                  ) : null}
                  {m}
                </button>
              ))}
            </div>
            <label className="range-label" htmlFor="target">
              Mục tiêu <b>{mode === "OFF" ? "25°C (Tắt)" : `${target}°C`}</b>
            </label>
            <input
              id="target"
              type="range"
              min={mode === "HEAT" ? 30 : 2}
              max={mode === "HEAT" ? 65 : 20}
              value={target}
              disabled={mode === "OFF"}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
            <button
              className="primary"
              disabled={busy || !connected}
              onClick={() =>
                void act(async () => {
                  await post("temperature", { mode, target });
                  setMessage(`Tủ ${selected}: đã áp dụng ${mode}${mode === "OFF" ? "" : ` (${target}°C)`}.`);
                })
              }
            >
              Áp dụng nhiệt độ cho Tủ {selected}
            </button>
          </section>

          <section className="card form-card">
            <div className="subhead">
              <KeyRound size={19} />
              <h3>Màn hình cảm ứng · OTP</h3>
            </div>
            <p className="touch-hint">
              Nhập mã OTP đã tạo từ form Web (hoặc tạo OTP test nhanh bên dưới)
              trên màn hình 3D để mở cửa Tủ {selected}.
            </p>
            <button
              className="secondary"
              disabled={busy || !connected || blocked > 0}
              onClick={() =>
                void act(async () => {
                  const otp = await post<{ code: string; expiresAt: number }>(
                    "otp/generate",
                    {},
                  );
                  setIssued(otp);
                  setMessage(`Tủ ${selected}: đã tạo OTP 5 phút.`);
                })
              }
            >
              Tạo OTP test nhanh cho Tủ {selected}
            </button>
            <div className="code-display">
              {issued && remaining > 0 ? (
                <>
                  <span>
                    OTP test · còn {Math.floor(remaining / 60)}:
                    {String(remaining % 60).padStart(2, "0")}
                  </span>
                  <strong>{issued.code}</strong>
                </>
              ) : (
                <span>
                  {locker?.backendStatus === "WAITING_DROP"
                    ? "Đang chờ Shipper nhập OTP từ Web"
                    : locker?.backendStatus === "OCCUPIED"
                      ? "Đang giữ hàng · Chờ OTP nhận"
                      : "Chưa có OTP test"}
                </span>
              )}
            </div>
            <p className="help">
              {blocked
                ? `Tạm khóa xác thực, còn ${blocked} giây`
                : `Còn ${locker?.otp.attemptsRemaining ?? 5} lần thử · bấm màn hình 3D để nhập`}
            </p>
            {locker?.doorOpen && (
              <p className="help">
                Cửa tự đóng sau {secondsToClose} giây nếu chưa đóng thủ công.
              </p>
            )}
          </section>

          <section className="card form-card vending-card">
            <div className="subhead">
              <GlassWater size={19} />
              <h3>Quầy nước &amp; đồ ăn vặt</h3>
            </div>
            <div className="vending-grid">
              {state?.vending.map((item) => (
                <button
                  key={item.id}
                  disabled={busy || !connected || item.stock === 0}
                  onClick={() =>
                    void act(async () => {
                      await request("vending/dispense", { id: item.id });
                      setMessage(`Quầy shipper: đã lấy ${item.name}.`);
                    })
                  }
                >
                  <span
                    className={
                      item.kind === "DRINK" ? "drink-icon" : "snack-icon"
                    }
                  >
                    {item.kind === "DRINK" ? "🥤" : "🍪"}
                  </span>
                  <b>{item.name}</b>
                  <small>{item.stock ? `Còn ${item.stock}` : "Hết hàng"}</small>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className="message" role="status">
        {busy ? "Đang xử lý…" : message}
      </div>

      <section className="card events">
        <div className="section-head">
          <div>
            <p className="overline">DÒNG SỰ KIỆN</p>
            <h2>Nhật ký mô phỏng &amp; đồng bộ Wokwi</h2>
          </div>
          <CircleHelp size={18} />
        </div>
        <div className="event-list">
          {events.length ? (
            events.slice(0, 20).map((e) => (
              <div key={e.id}>
                <time>
                  {new Date(e.at).toLocaleTimeString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </time>
                <b>{e.lockerId}</b>
                <span>{e.message}</span>
              </div>
            ))
          ) : (
            <p>Chưa có sự kiện. Tạo đơn trên Web, mở cửa trên 3D hoặc chạy Wokwi để bắt đầu.</p>
          )}
        </div>
      </section>
    </main>
  );
}
