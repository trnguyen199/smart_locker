# SMART LOCKER — BÀN GIAO NHÁNH `backend` (NGỌC HIẾU)

Nhánh `backend` giữ nguyên **100% file gốc trên nhánh `main` của Nguyên (0 dòng sửa, 0 xung đột khi merge)** và hoàn thiện đầy đủ 12 file trống + các module Backend/Supabase/Kiosk API chuẩn doanh nghiệp.

---

## 1. Dành cho Nguyên (Leader — Trạng thái tích hợp)

1. **Chạy Schema Supabase:** Dán toàn bộ `supabase/schema.sql` vào **Supabase Dashboard → SQL Editor → Run** (100% idempotent, chạy lại nhiều lần không lỗi trùng bảng hay policy `42710`).
2. **Tạo file `.env` cục bộ (không commit):** Copy `.env.example` → `.env` và điền `SUPABASE_SECRET_KEY=sb_secret_...`.
3. **Giao diện đã được tích hợp:** `includes/layout.php` đã nạp `api.js`, `admin.php` đã nạp `admin.js`.
4. **Chạy migration bảo mật:** với database hiện hữu, chạy các file trong `supabase/migrations/` theo thứ tự tên.
5. **Bootstrap ADMIN:** cấu hình `ADMIN_EMAILS` phía server; backend không còn tin `account_type=company` từ trình duyệt để cấp quyền.

---

## 2. Hợp đồng API dành cho Phạm Vũ Lân (Mô phỏng tủ Web) & Duy Quách (Mạch giả lập)

- **Base URL:** `http://127.0.0.1:8000`; CORS chỉ cho các origin trong `CORS_ALLOWED_ORIGIN`.
- **Header xác thực thiết bị:** `X-Device-Key: <khóa riêng trong .env>` (không gửi khóa qua query string).
- **Kênh điều khiển chuẩn:** REST polling `kiosk_state`/`iot_sync` với `pending_cmd`. MQTT trình duyệt tắt mặc định để không phát OTP hoặc lệnh điều khiển lên broker công khai.

| # | Endpoint | Method | Dùng cho | Payload / Ghi chú |
|---|---|---|---|---|
| 1 | `/api.php?action=kiosk_state` | `GET` | Lân / Duy | Lấy trạng thái 9 ngăn tủ (`AVAILABLE`, `WAITING_DROP`, `OPEN`, `OCCUPIED`, `LOCKOUT`, `ERROR`), nhiệt độ mục tiêu và `pending_cmd`. |
| 2 | `/api/verify_otp.php` | `POST` | Lân / Duy / Web | Body `{"otp":"184920","locker_id":1}`. Trả `200` mở cửa (`SHIPPER_DROP`/`RECEIVER_PICKUP`), `401` sai OTP, `409` Shipper OTP đã dùng, `410` quá hạn `EXPIRED`, `423` khóa an ninh 60s (sai 3 lần). |
| 3 | `/api.php?action=kiosk_door_event` | `POST` | Lân / Duy | Body `{"locker_id":1,"event":"DOOR_CLOSED","has_item":true}` (`DOOR_CLOSED` / `DOOR_OPENED` / `ACK_CMD`). Nếu `DOOR_OPENED` khi `OCCUPIED` mà chưa xác thực OTP → tự bắn cảnh báo cạy cửa `CRITICAL`. |
| 4 | `/api.php?action=iot_sync` | `POST` | Duy / Lân | Body `{"locker_id":1,"current_temp":7.2,"humidity":60,"pwm_power":40,"door_locked":true,"has_item":true}`. Lưu `telemetry_logs`, chạy AI phân tích `dT/dt` và trả về `pending_cmd` mới nhất. |

---

## 3. Kiểm thử & Quy trình Git lên nhánh `backend` (Ngọc Hiếu chạy trên máy)

```powershell
# 1. Chạy server PHP (Cửa sổ PowerShell 1)
php -S 127.0.0.1:8000 router.php

# 2. Kiểm tra cú pháp toàn bộ PHP + chạy bộ Test Auth (Nguyên) + Test API Smoke (Ngọc Hiếu)
Get-ChildItem -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName }
node tests/auth.mjs
node tests/security.mjs
node tests/api_smoke.mjs

# 3. Đẩy sạch lên nhánh backend (kiểm tra chắc chắn KHÔNG có .env trong git status)
git checkout -B backend origin/main
git status
git add .
git commit -m "feat(backend): hoàn thiện PHP+Supabase API, vòng đời OTP/tủ, Kiosk CORS và AI nhiệt học"
git push -u origin backend
```

---

## 4. Trọng tâm Vấn đáp (Đặc biệt mảng BA + IoT)

1. **Vòng đời nghiệp vụ & xử lý sự cố (BA):**
   - **Đặt trùng ngăn:** `api/create_booking.php` dùng Conditional Atomic PATCH (`status=eq.AVAILABLE&online=eq.true`) ở PostgreSQL → người thứ hai nhận `409 Conflict`.
   - **Sai OTP 3 lần:** `api/verify_otp.php` chặn trước bằng `lockout_until` (`423 Locked` trong 60s) và ghi cảnh báo `CRITICAL` vào `alerts`.
   - **Quá hạn lấy hàng:** `sweepExpiredBookings()` tự chuyển đơn quá `expires_at` sang `EXPIRED` (`410 Gone`), giữ cửa đóng an toàn và bắn cảnh báo để Admin xử lý (`force_open.php` / `reset_locker.php`).
   - **Shipper dùng lại OTP:** Lưu `shipper_otp_used_at`, nhập lại lần 2 bị chặn ngay với `409 Conflict`.
2. **Bảo mật Supabase chuẩn khóa mới:** Trình duyệt chỉ giữ `sb_publishable_` (RLS chặn ghi trực tiếp). Toàn bộ PHP Backend xác thực JWT trực tiếp tại `/auth/v1/user`, đối chiếu vai trò 3 cấp (`ADMIN`/`SHIPPER`/`RECEIVER`) với bảng `company_members`, và gửi `sb_secret_` **chỉ qua header `apikey`** (không gửi `Authorization: Bearer` vì `sb_secret_` không phải JWT).
3. **Phát hiện bất thường nhiệt học (AI):** Hàm `analyzeThermalHealth()` đánh giá đồng thời `|current_temp - target_temp|`, độ dốc $\Delta T / \Delta t$, công suất `pwm_power` và trạng thái cửa để phát hiện sớm rò rỉ nhiệt/hở cửa trước khi thực phẩm hỏng.
