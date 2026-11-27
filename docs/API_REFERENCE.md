# TÀI LIỆU API & HỢP ĐỒNG GIAO TIẾP SMART LOCKER (PHP + SUPABASE)

> **Tác giả:** Hà Ngọc Hiếu  
> **Ngôn ngữ Backend:** PHP 7.4+ thuần (cURL + JSON, không cần framework nặng)  
> **Cơ sở dữ liệu:** Supabase PostgreSQL (PostgREST API)  
> **Xác thực:** Web dùng Supabase Auth JWT | IoT dùng Header `X-Device-Key`

---

## 1. Cổng API Gateway (`api.php`)

| Endpoint (`?action=`) | Method | Xác thực | Mục đích |
|---|---|---|---|
| `health` | GET | Không | Kiểm tra gateway hoạt động |
| `dashboard_stats` | GET | JWT hoặc X-Device-Key | Thống kê 7 ngày (`?mode=stats`) hoặc Deep Health (`?mode=health`) |
| `cron_sweep` | GET | `X-Device-Key` (hoặc CLI) | Quét expired, offline detection, cleanup |
| `mqtt_bridge` | POST | `X-Device-Key` | HTTP Bridge cho ESP32 (`heartbeat`, `telemetry`, `event`) |
| `iot_sync` | POST | `X-Device-Key` | Đồng bộ 1 ngăn tủ từ ESP32/Wokwi |
| `auth` | POST | Bearer JWT | Đồng bộ profile và trả role RBAC |
| `lockers` | GET/PATCH | Bearer JWT | Đọc 9 tủ kèm AI analysis / Admin chỉnh nhiệt độ |
| `telemetry` | GET | Bearer JWT | Chuỗi thời gian nhiệt độ cho Chart.js |
| `create_booking` | POST | Bearer JWT | Tạo đơn gửi hàng, sinh Smart Prefix OTP |
| `verify_otp` | POST | JWT hoặc Keypad | Xác thực OTP 6 số (mở Shipper/Receiver) |
| `force_open` | POST | Bearer JWT (Admin) | Mở khóa khẩn cấp từ xa |
| `reset_locker` | POST | Bearer JWT (Admin) | Đặt lại tủ về trống, hủy đơn cũ |
| `account` | GET/POST/PATCH/DELETE | Bearer JWT | Quản lý hồ sơ và thành viên công ty |
| `support` | GET/POST/PATCH | Bearer JWT | Quản lý phiếu hỗ trợ |

---

## 2. Hợp Đồng Dữ Liệu IoT (MQTT + REST)

- **MQTT Broker:** `wss://broker.emqx.io:8084/mqtt` (Web) | `broker.emqx.io:1883` (ESP32)
- **Topic Lệnh (Web -> Mạch):** `uth/iot/smartlocker/nhom4/cmd` (QoS 1)
- **Topic Trạng thái (Mạch -> Web):** `uth/iot/smartlocker/nhom4/state` (QoS 0)

### Payload Telemetry (Mạch gửi lên mỗi 2-3s):
```json
{
  "locker_id": 1,
  "current_temp": 7.2,
  "target_temp": 8.0,
  "humidity": 60,
  "pwm_power": 40,
  "door_locked": true,
  "has_item": true
}
```

### Payload Command (Web gửi xuống tủ):
```json
{
  "cmd": "REMOTE_UNLOCK",
  "locker_id": 1,
  "slot": 1,
  "reason": "RECEIVER_PICKUP"
}
```

---

## 3. Quy Tắc Nghiệp Vụ BA

1. **Smart Prefix OTP:**
   - Đầu `1`: Đồ mát / nước lạnh (<= 10°C)
   - Đầu `2`: Đồ ăn nóng (>= 40°C)
   - Đầu `3`: Bưu kiện thường (25°C)
2. **Anti-Brute-Force:** Sai 3 lần liên tiếp tại 1 tủ -> khóa `LOCKOUT` 60 giây và bắn cảnh báo `CRITICAL`.
3. **Chống Race Condition:** `api/create_booking.php` dùng Atomic Conditional PATCH (`status=eq.AVAILABLE&online=eq.true`).
4. **AI Thermal Anomaly:** Phân tích độ lệch nhiệt và tốc độ hội tụ dT/dt so với công suất PWM để phát hiện sớm hở cửa hoặc hỏng sò lạnh.
