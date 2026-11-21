# Supabase setup

## 1. Tạo cấu hình local

```powershell
Copy-Item .env.example .env
Copy-Item config\supabase.example.js config\supabase.js
```

Trong `.env`, cấu hình `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, một `IOT_DEVICE_KEY` ngẫu nhiên, `CORS_ALLOWED_ORIGIN` và email quản trị ban đầu trong `ADMIN_EMAILS`.

`config/supabase.js` chỉ được chứa URL và Publishable key. Tuyệt đối không đặt Secret key vào file này.

## 2. Khởi tạo database

Trên Supabase Dashboard → SQL Editor:

1. Với database mới, chạy `supabase/schema.sql`.
2. Với database hiện hữu, chạy lần lượt file trong `supabase/migrations/`.
3. Kiểm tra RLS đã bật và role `anon`/`authenticated` không có quyền đọc trực tiếp bảng nghiệp vụ.

Migration hardening có unique index cho đơn ACTIVE và OTP. Nếu database cũ có dữ liệu trùng, cần xử lý bản ghi trùng trước khi chạy migration.

## 3. Cấu hình Auth

- Bật Email/Password provider.
- Site URL local: `http://127.0.0.1:8000`.
- Redirect URLs:
  - `http://127.0.0.1:8000/auth-callback.php`
  - `http://127.0.0.1:8000/update-password.php`

Quyền ADMIN không lấy từ `user_metadata`. Email trong `ADMIN_EMAILS` chỉ dùng để bootstrap quản trị viên đầu tiên; các tài khoản sau được cấp quyền qua `company_members`.

## 4. CA certificate trên Windows

Nếu PHP cURL không tìm được CA bundle, đặt trong `.env`:

```dotenv
SUPABASE_CA_BUNDLE=C:\path\to\cacert.pem
```

Ưu tiên cấu hình lâu dài trong `php.ini`:

```ini
curl.cainfo="C:\path\to\cacert.pem"
openssl.cafile="C:\path\to\cacert.pem"
```

Không tắt `CURLOPT_SSL_VERIFYPEER` để chữa lỗi certificate.

## 5. Chạy và kiểm tra

```powershell
php -S 127.0.0.1:8000 router.php
node tests/security.mjs
node tests/api_smoke.mjs
```
