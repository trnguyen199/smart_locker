# Smart Locker Business

Webapp PHP 8 + JavaScript + Supabase cho quy trình gửi/nhận hàng bằng OTP, quản lý 9 ngăn tủ, nhiệt độ, cảnh báo và API dành cho kiosk/mạch giả lập.

## Yêu cầu

- PHP 8.1+ với `curl`, `json`, `mbstring`, `openssl`.
- Node.js 18+ để chạy test.
- Một dự án Supabase đã bật Email/Password.
- Không cần SQLite, MySQL hoặc database cục bộ.

## Cài đặt

1. Copy `.env.example` thành `.env`, điền Secret key, khóa thiết bị ngẫu nhiên và CORS allowlist.
2. Copy `config/supabase.example.js` thành `config/supabase.js`, điền Project URL và Publishable key.
3. Chạy `supabase/schema.sql` trên Supabase SQL Editor. Với database đã tồn tại, chạy thêm các file trong `supabase/migrations/` theo thứ tự tên.
4. Cấu hình Supabase Auth Site URL và Redirect URLs cho `auth-callback.php`, `update-password.php`.
5. Đặt email quản trị đầu tiên trong `ADMIN_EMAILS` của `.env`. Không dùng metadata đăng ký để cấp ADMIN.

Xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md) để biết chi tiết.

## Chạy local

Luôn chạy kèm `router.php` để `.env`, migration và test không bị phục vụ như file tĩnh:

```powershell
php -S 127.0.0.1:8000 router.php
```

Mở `http://127.0.0.1:8000`.

Nếu PHP trên Windows báo `unable to get local issuer certificate`, cấu hình `curl.cainfo`/`openssl.cafile` trong `php.ini` hoặc đặt `SUPABASE_CA_BUNDLE` trỏ đến CA bundle hợp lệ.

## Chức năng

- Supabase Auth: đăng ký, đăng nhập, xác nhận email, khôi phục mật khẩu và đăng xuất.
- RBAC phía backend: `ADMIN`, `SHIPPER`, `RECEIVER`; không tin `user_metadata` để cấp quyền.
- Tạo đơn, giữ ngăn trống bằng conditional update, sinh OTP, quản lý hết hạn và chống dùng lại.
- Trạng thái tủ: `AVAILABLE → WAITING_DROP → OPEN → OCCUPIED → OPEN → AVAILABLE`.
- Điều chỉnh nhiệt độ, nhận telemetry, lưu lịch sử và phát cảnh báo nhiệt/cửa.
- Admin: mở khẩn cấp, reset tủ, quản lý thành viên và xem cảnh báo.
- Kiosk/mạch: REST API có `X-Device-Key`, đọc `pending_cmd`, xác nhận lệnh và gửi sự kiện cửa.
- Support ticket và cập nhật hồ sơ.

MQTT trực tiếp từ trình duyệt bị tắt mặc định. Không phát OTP/lệnh điều khiển lên broker công khai; thiết bị dùng REST API và khóa riêng.

## API cho kiosk/mạch

Mọi request thiết bị phải gửi header `X-Device-Key`.

| Endpoint | Method | Mục đích |
| --- | --- | --- |
| `/api.php?action=health` | GET | Health check và metadata API |
| `/api.php?action=kiosk_state` | GET | Đọc 9 tủ và `pending_cmd` |
| `/api.php?action=kiosk_door_event` | POST | `DOOR_OPENED`, `DOOR_CLOSED`, `ACK_CMD` |
| `/api.php?action=iot_sync` | POST | Gửi nhiệt độ, độ ẩm, cửa, vật thể và ACK |
| `/api/verify_otp.php` | POST | Xác thực OTP bằng JWT hoặc khóa thiết bị |

OTP không xuất hiện trong API danh sách, telemetry hoặc MQTT command.

## Kiểm thử

Khởi động server bằng `router.php`, sau đó chạy:

```powershell
Get-ChildItem -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName }
Get-ChildItem assets\js -Filter *.js | ForEach-Object { node --check $_.FullName }
node tests/auth.mjs
node tests/security.mjs
node tests/api_smoke.mjs
```

Đặt `TEST_ADMIN_TOKEN` chỉ khi muốn chạy E2E có ghi dữ liệu. Không dùng token cá nhân trong CI hoặc commit token vào repository.

## Cấu trúc chính

```text
api/                         # API nghiệp vụ PHP
assets/js/api.js             # Client API và hydration giao diện
assets/js/admin.js           # Chức năng quản trị
config/env.php               # Đọc biến môi trường phía server
config/supabase.js           # Chỉ chứa URL + Publishable key
router.php                   # Router bảo vệ cho PHP built-in server
supabase/schema.sql          # Schema cài mới
supabase/migrations/         # Migration tăng cường cho DB hiện hữu
tests/                       # Auth, security và API smoke tests
```

## Bảo mật triển khai

- Document root production không được chứa `.env`; cấu hình Nginx/Apache phải chặn dotfiles và thư mục nội bộ.
- `SUPABASE_SECRET_KEY`, `IOT_DEVICE_KEY`, token test không được đưa vào JavaScript/Git/log.
- Dùng HTTPS, CORS allowlist cụ thể và khóa thiết bị riêng cho từng môi trường.
- Áp migration hardening để thu hồi quyền đọc trực tiếp các bảng nghiệp vụ khỏi `anon`/`authenticated`.
