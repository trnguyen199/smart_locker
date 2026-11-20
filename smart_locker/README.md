# Smart Locker Business — Backend & Realtime Architecture

> **Phân nhánh:** `backend`  
> **Thành viên phụ trách:** Ngọc Hiếu (Backend & API kết nối)  
> **Mục tiêu:** Cung cấp toàn bộ logic xử lý nghiệp vụ, API REST an toàn và kênh truyền thông Realtime đồng bộ giữa Cơ sở dữ liệu Supabase, Giao diện Web, Bản mô phỏng và Mạch ESP32 giả lập.

---

## 1. Kiến trúc tổng thể (Dual-Channel Architecture)

Hệ thống được thiết kế theo mô hình 2 kênh độc lập nhằm tối ưu hiệu năng và độ ổn định:

1. **Kênh dữ liệu bền vững (Persistence Channel) — PHP + Supabase PostgREST:**
   - Xử lý các giao dịch CRUD: Đặt tủ, tạo đơn hàng, sinh mã OTP, phân quyền tài khoản, lưu trữ lịch sử và audit log.
   - Sử dụng PHP thuần giao tiếp trực tiếp qua REST API (cURL) của Supabase PostgreSQL, không phụ thuộc Composer hay framework nặng, chạy trực tiếp bằng `php -S 127.0.0.1:8000 -t .`.
   - Xác thực bảo mật: Mỗi request gửi lên PHP đều kèm Bearer JWT Token của Supabase Auth. Backend tự xác thực trực tiếp với endpoint `/auth/v1/user` để chống giả mạo quyền ở Client.
   - Chống tranh chấp (Race Condition): Áp dụng truy vấn cập nhật nguyên tử có điều kiện (**Conditional Atomic PATCH**) trên PostgreSQL khi đặt tủ.

2. **Kênh thời gian thực (Realtime Channel) — EMQX MQTT over WebSockets:**
   - Broker WSS: `wss://broker.emqx.io:8084/mqtt` | ESP32 TCP: `broker.emqx.io:1883`
   - Đảm bảo độ trễ điều khiển chốt khóa Solenoid và phản hồi nhiệt độ từ mạch đạt dưới **100ms**.
   - Bật cơ chế `QoS=1` và `retain=true` để mạch ESP32 nhận ngay lệnh chờ kể cả khi vừa khởi động lại.

3. **Module AI nhiệt học (Thermal Anomaly Detection):**
   - Đánh giá sức khỏe vận hành từng ngăn tủ bằng cách phân tích độ dốc nhiệt $\frac{dT}{dt}$ kết hợp công suất làm lạnh PWM và độ mở cửa, phát hiện sớm các sự cố rò rỉ nhiệt hoặc hỏng sò Peltier trước khi hàng hóa bị hư hỏng.

---

## 2. Danh mục API Endpoints

Toàn bộ API đặt trong thư mục `api/` và trả về định dạng chuẩn `JSON`:

| Endpoint | Method | Quyền hạn | Mô tả chức năng |
| :--- | :---: | :---: | :--- |
| `api/create_booking.php` | `POST` | User / Company | Tạo đơn gửi hàng, sinh mã Smart Prefix OTP (1: lạnh, 2: mát, 3: thường), khóa tủ an toàn. |
| `api/verify_otp.php` | `POST` | Public / Khách | Nhập mã OTP 6 số để mở ngăn tủ, tự động tăng số lần sai và khóa sau 3 lần. |
| `api/lockers.php` | `GET` | User / Company | Lấy danh sách 9 ngăn tủ kèm kết quả phân tích AI và thống kê giao dịch. |
| `api/lockers.php` | `POST` | IoT Device | Nhận telemetry từ ESP32 / Wokwi, chạy AI phân tích và trả về lệnh chờ (`pending_cmd`). |
| `api/lockers.php` | `PATCH` | Admin | Điều chỉnh trực tiếp nhiệt độ mục tiêu Setpoint cho từng ngăn tủ. |
| `api/force_open.php` | `POST` | Admin | Lệnh mở khóa khẩn cấp dành riêng cho quản trị viên doanh nghiệp. |
| `api/reset_locker.php` | `POST` | Admin | Đặt lại trạng thái tủ về `AVAILABLE` khi có sự cố kỹ thuật. |
| `api/telemetry.php` | `GET` | User / Company | Trích xuất chuỗi dữ liệu lịch sử nhiệt độ phục vụ vẽ biểu đồ Chart.js trực tiếp. |
| `api/account.php` | `GET`, `POST` | User / Company | Quản lý thông tin hồ sơ và danh sách thành viên trong không gian công ty. |
| `api/support.php` | `POST` | User / Company | Tiếp nhận phiếu yêu cầu hỗ trợ người dùng. |
| `api.php` | Any | Public / IoT | Cổng Gateway chuyển tiếp tương thích các URL gọi cũ. |

---

## 3. Hợp đồng giao tiếp Realtime MQTT (JSON Contract)

Dành cho **Nguyên** (Frontend), **Phạm Vũ Lân** (Bản mô phỏng) và **Duy Quách** (Mạch ESP32 Wokwi):

### A. Topic Lệnh: `uth/iot/smartlocker/nhom4/cmd` (Web / Backend -> Mạch)
```json
{
  "cmd": "OPEN_DOOR",
  "slot": 1,
  "category": "DRINK",
  "target_temp": 5.0,
  "timestamp": 1732100000
}
```
*Các mã `cmd` hỗ trợ:* `OPEN_DOOR`, `CREATE_ORDER`, `FORCE_OPEN`, `RESET_LOCKER`.

### B. Topic Trạng thái: `uth/iot/smartlocker/nhom4/state` (Mạch / Mô phỏng -> Web)
```json
{
  "slot": 1,
  "temp": 5.4,
  "target_temp": 5.0,
  "humidity": 65.0,
  "pwm_power": 40,
  "door_locked": true,
  "online": true,
  "status": "OCCUPIED"
}
```

---

## 4. Hướng dẫn cài đặt và chạy thử

### Bước 1: Khởi tạo Cơ sở dữ liệu Supabase
1. Vào Supabase Dashboard -> **SQL Editor** -> **New Query**.
2. Dán toàn bộ nội dung file `supabase/schema.sql` và bấm **Run** (tự động tạo 8 bảng, chính sách RLS và 9 ngăn tủ mặc định).

### Bước 2: Cấu hình biến môi trường
1. Sao chép file `.env.example` thành `.env` cùng thư mục:
   ```bash
   cp .env.example .env
   ```
2. Điền thông tin khóa bí mật lấy từ **Supabase Dashboard -> Project Settings -> API**:
   - `SUPABASE_URL=https://<your-project>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
   - `SUPABASE_SECRET_KEY=sb_secret_...`

### Bước 3: Khởi chạy Web Server
Chạy lệnh trực tiếp từ thư mục `smart_locker`:
```powershell
php -S 127.0.0.1:8000 -t .
```
Truy cập [http://127.0.0.1:8000](http://127.0.0.1:8000) trên trình duyệt.

### Bước 4: Chạy mạch mô phỏng ESP32 (Wokwi)
1. Mở dự án trên Wokwi (ESP32).
2. Dán mã nguồn từ `wokwi/esp32_smart_locker.ino` và danh sách thư viện từ `wokwi/libraries.txt`.
3. Nhấn **Start Simulation**. Mạch sẽ tự kết nối WiFi ảo, MQTT Broker và đồng bộ trạng thái hai chiều lên Web.
