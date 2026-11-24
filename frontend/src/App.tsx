import { useEffect, useRef, useState } from "react";
import {
  Box,
  CircleHelp,
  Fan,
  Flame,
  KeyRound,
  Package,
  Radio,
  Snowflake,
  Thermometer,
  GlassWater,
} from "lucide-react";
import type { Mode } from "../../shared/types";
import LockerScene from "./scenes/LockerScene";
import { request, useLocker } from "./hooks/useLocker";

export default function App() {
  const { state, events, connected } = useLocker();
  const [selected, setSelected] = useState("C3"),
    [kioskSelected, setKioskSelected] = useState<string | null>(null),
    [focusScreen, setFocusScreen] = useState(false),
    [mode, setMode] = useState<Mode>("COOL"),
    [target, setTarget] = useState(15),
    [code, setCode] = useState(""),
    [screenFeedback, setScreenFeedback] = useState("Nhập OTP đã được cấp"),
    [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(
      null,
    ),
    [message, setMessage] = useState("Chọn một ngăn trên dàn tủ để bắt đầu."),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const openedOnScreen = useRef<string | null>(null);
  const locker = state?.lockers.find((l) => l.id === selected);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setCode("");
    setIssued(null);
    if (locker) {
      setMode(locker.mode === "OFF" ? "COOL" : locker.mode);
      setTarget(
        locker.mode === "HEAT"
          ? Math.max(30, locker.target)
          : Math.min(20, locker.target),
      );
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
  const offset = (state?.serverTime ?? now) - now,
    remaining = Math.max(
      0,
      Math.ceil(((issued?.expiresAt ?? 0) - now - offset) / 1000),
    ),
    blocked = Math.max(
      0,
      Math.ceil(((locker?.otp.blockedUntil ?? 0) - now - offset) / 1000),
    ),
    secondsToClose = Math.max(
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
      setMessage(`${selected}: OTP hợp lệ, cửa đã mở.`);
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
        `${selected}: đã đặt hàng. OTP nhận hàng hiện trên dashboard để bạn chuyển cho người nhận.`,
      );
    } else {
      await post("parcel", { parcel: "EMPTY" });
      await post("door/close", {});
      setKioskSelected(null);
      setIssued(null);
      setMessage(`${selected}: đã lấy hàng và đóng cửa.`);
    }
  }
  const counts = {
    loaded: state?.lockers.filter((l) => l.parcel === "LOADED").length ?? 0,
    open: state?.lockers.filter((l) => l.doorOpen).length ?? 0,
    cooling: state?.lockers.filter((l) => l.mode === "COOL").length ?? 0,
  };
  return (
    <main className="app">
      <header className="header">
        <div className="logo">
          <Box size={24} />
        </div>
        <div>
          <p className="overline">Z LAB INSPIRED · SOFTWARE DIGITAL TWIN</p>
          <h1>
            Dàn tủ giao nhận đồ ăn <span>30 ngăn + quầy shipper</span>
          </h1>
        </div>
        <div
          className={`connection ${connected ? "online" : ""}`}
          role="status"
        >
          <i />
          {connected ? "Đang kết nối trực tiếp" : "Mất kết nối backend"}
        </div>
      </header>
      <section className="summary" aria-label="Tổng quan">
        <div>
          <span>Tổng ngăn</span>
          <strong>30</strong>
          <small>5 hàng × 6 cột</small>
        </div>
        <div>
          <span>Đang chứa hàng</span>
          <strong>{counts.loaded.toString().padStart(2, "0")}</strong>
          <small>gói hàng mô phỏng</small>
        </div>
        <div>
          <span>Cửa đang mở</span>
          <strong>{counts.open.toString().padStart(2, "0")}</strong>
          <small>khóa độc lập</small>
        </div>
        <div>
          <span>Đang làm lạnh</span>
          <strong>{counts.cooling.toString().padStart(2, "0")}</strong>
          <small>module Peltier</small>
        </div>
      </section>
      <div className="layout">
        <section className="stage card">
          <div className="section-head">
            <div>
              <p className="overline">MÔ HÌNH 3D · DÀN TỦ</p>
              <h2>Quan sát từng ngăn</h2>
            </div>
            <span className="pill">30 NGĂN · 1 QUẦY BÊN CẠNH</span>
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
                  setMessage(`${selected}: đã đóng và khóa cửa.`);
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
                <p className="overline">NGĂN ĐANG CHỌN</p>
                <h2>
                  {selected} <span className="light">/ 30</span>
                </h2>
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
                <span>Quạt</span>
                <b>{locker?.fan ? "Đang chạy" : "Tắt"}</b>
              </div>
              <div>
                <Radio size={18} />
                <span>H-Bridge</span>
                <b>
                  {locker?.polarity === -1
                    ? "Đảo cực"
                    : locker?.polarity === 1
                      ? "Thuận cực"
                      : "Ngắt"}
                </b>
              </div>
            </div>
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
              <p>
                {locker?.mode === "COOL"
                  ? "Luồng khí lạnh đang lưu chuyển trong ngăn."
                  : locker?.mode === "HEAT"
                    ? "Luồng khí ấm đang lan dần trong ngăn."
                    : "Chọn COOL hoặc HEAT rồi áp dụng để quan sát hiệu ứng."}
              </p>
            </div>
            <div className="cell-chooser" aria-label="Chọn ngăn tủ">
              {state?.lockers.map((l) => (
                <button
                  key={l.id}
                  aria-label={`Chọn ngăn ${l.id}`}
                  aria-pressed={selected === l.id}
                  className={selected === l.id ? "active" : ""}
                  onClick={() => setSelected(l.id)}
                >
                  {l.id}
                </button>
              ))}
            </div>
          </section>
          <section className="card form-card">
            <div className="subhead">
              <Thermometer size={19} />
              <h3>Điều khiển nhiệt</h3>
            </div>
            <div className="mode-buttons">
              {(["COOL", "HEAT", "OFF"] as Mode[]).map((m) => (
                <button
                  key={m}
                  className={mode === m ? "active" : ""}
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setTarget(m === "HEAT" ? 38 : 15);
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
              Mục tiêu <b>{mode === "OFF" ? "—" : `${target}°C`}</b>
            </label>
            <input
              id="target"
              type="range"
              min={mode === "HEAT" ? 30 : 5}
              max={mode === "HEAT" ? 45 : 20}
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
                  setMessage(`${selected}: đã áp dụng ${mode}.`);
                })
              }
            >
              Áp dụng cho ngăn {selected}
            </button>
          </section>
          <section className="card form-card">
            <div className="subhead">
              <KeyRound size={19} />
              <h3>Màn hình cảm ứng · OTP</h3>
            </div>
            <p className="touch-hint">
              Ô trống: cấp mã cho shipper gửi hàng. Sau khi đặt hàng, chuyển mã
              nhận hàng mới cho người nhận; họ chọn ô có hàng và nhập mã trên
              tủ.
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
                  setMessage(`${selected}: đã tạo OTP 5 phút.`);
                })
              }
            >
              Tạo OTP {locker?.parcel === "LOADED" ? "nhận hàng" : "gửi hàng"}{" "}
              cho {selected}
            </button>
            <div className="code-display">
              {issued && remaining > 0 ? (
                <>
                  <span>
                    OTP {locker?.parcel === "LOADED" ? "nhận hàng" : "gửi hàng"}{" "}
                    · còn {Math.floor(remaining / 60)}:
                    {String(remaining % 60).padStart(2, "0")}
                  </span>
                  <strong>{issued.code}</strong>
                </>
              ) : (
                <span>
                  {locker?.otp.active
                    ? "OTP đã tạo ở phiên khác"
                    : "Chưa có OTP"}
                </span>
              )}
            </div>
            <p className="help">
              {blocked
                ? `Tạm khóa xác thực, còn ${blocked} giây`
                : `Còn ${locker?.otp.attemptsRemaining ?? 5} lần thử · nhập mã trên màn hình tủ`}
            </p>
            {locker?.doorOpen && (
              <p className="help">
                Cửa tự đóng sau {secondsToClose} giây nếu chưa đóng thủ công.
              </p>
            )}
            {locker?.doorOpen && (
              <div className="open-actions">
                <button onClick={() => void act(updateParcel)}>
                  {locker.parcel === "EMPTY"
                    ? "Đặt hàng vào ngăn"
                    : "Lấy hàng ra"}
                </button>
                <button
                  onClick={() =>
                    void act(async () => {
                      await post("door/close", {});
                      setMessage(`${selected}: đã đóng và khóa cửa.`);
                    })
                  }
                >
                  Đóng & khóa cửa
                </button>
              </div>
            )}
          </section>
          <section className="card form-card vending-card">
            <div className="subhead">
              <GlassWater size={19} />
              <h3>Nước & đồ ăn vặt cho shipper</h3>
            </div>
            <p className="help">
              Chọn một món để mô phỏng lấy từ khoang bên dưới màn hình.
            </p>
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
            <h2>Nhật ký mô phỏng</h2>
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
            <p>Chưa có sự kiện. Tạo OTP hoặc đổi chế độ nhiệt để bắt đầu.</p>
          )}
        </div>
      </section>
      <footer>
        Mô hình tham khảo từ ảnh/video người dùng cung cấp · 30 ngăn là cấu hình
        demo · mô phỏng nhiệt chưa được kiểm chứng vật lý
      </footer>
    </main>
  );
}
