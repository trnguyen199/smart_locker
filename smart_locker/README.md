# Smart Locker Business

Giao diện website / webapp PHP, đăng nhập bằng Supabase Auth. Các API nghiệp vụ để trống để bạn tự triển khai.

## Kết nối Supabase

1. Điền Project URL và Publishable key vào `config/supabase.js`.
2. Bật Email/Password trong Supabase Authentication.
3. Cấu hình Site URL và hai Redirect URLs cho `auth-callback.php`, `update-password.php`.
4. Chạy PHP, đăng ký / đăng nhập để vào bảng điều khiển.

Hướng dẫn chi tiết: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

```powershell
php -S 127.0.0.1:8000 -t .
```

Mở `http://127.0.0.1:8000`. Cần PHP 7.4 trở lên với mbstring và Internet để tải SDK / dùng Supabase Auth. Không dùng SQLite, MySQL hoặc cơ sở dữ liệu cục bộ.

## Phần hoạt động

- Trang chủ, thanh điều hướng, menu điện thoại và liên kết giữa các trang.
- Đăng nhập / đăng ký Supabase, xác nhận email, giữ phiên và đăng xuất.
- Quên mật khẩu, đặt lại mật khẩu theo liên kết email.
- Chưa đăng nhập sẽ được đưa về trang đăng nhập; đăng nhập xong chuyển vào trang điều khiển hoặc trang nội bộ đang muốn xem.
- Hồ sơ hiển thị tên, email và tên công ty từ Supabase Auth.
- Lưới 9 tủ vuông 3 × 3, chọn tủ và xem thiết lập trên giao diện.
- Chuyển giữa trang gửi hàng và nhập OTP; tìm FAQ, lọc / phân trang dữ liệu mẫu.

## Chỉ là giao diện, chưa có nghiệp vụ

Tủ, lịch sử và biểu đồ dùng dữ liệu minh họa. Gửi hàng, cấp / kiểm tra OTP, mở cửa tủ, reset, thành viên, phân quyền, lưu hồ sơ và gửi yêu cầu hỗ trợ chưa được kết nối. Các nút xác nhận nghiệp vụ được tắt.

`api.php`, toàn bộ `api/*.php`, `assets/js/api.js` và `assets/js/admin.js` đều trống. Giao diện không gọi các file này. Không có schema hoặc API SQLite. Auth chạy trực tiếp bằng Supabase SDK trong `assets/js/auth.js`.

## Các trang

| Trang | Nội dung |
| --- | --- |
| `index.php` | Trang chủ doanh nghiệp |
| `login.php`, `register.php` | Đăng nhập / đăng ký |
| `forgot-password.php`, `update-password.php` | Quên / đặt lại mật khẩu |
| `auth-callback.php` | Nhận liên kết xác nhận email |
| `dashboard.php` | Trang điều khiển sau đăng nhập |
| `lockers.php` | Giao diện gửi hàng và lưới tủ |
| `lockers.php?mode=receive` | Giao diện nhận hàng, nhập OTP |
| `history.php` | Lịch sử minh họa |
| `admin.php`, `members.php` | Giao diện quản lý hệ thống / thành viên |
| `support.php` | Hỗ trợ, FAQ và biểu mẫu xem trước |
| `settings.php`, `logout.php` | Hồ sơ và đăng xuất Supabase |

## Cấu trúc chính

```text
config/supabase.js                 # Điền cấu hình dự án
config/supabase.example.js         # Bản mẫu cấu hình
assets/css/webapp.css              # Giao diện website và webapp
assets/js/supabase-client.js       # Khởi tạo Supabase Auth
assets/js/auth.js                  # Đăng nhập và điều hướng
assets/js/app.js                   # Menu, dialog và FAQ
assets/js/locker.js                # Chọn tủ, thiết lập xem trước
assets/js/api.js                   # Trống
assets/js/admin.js                 # Trống
assets/images/                    # Ảnh, logo, favicon
includes/layout.php               # Header, sidebar, footer
includes/app.php                  # Hàm hiển thị, không kết nối DB
includes/locker-board.php          # Lưới tủ 3 cột
includes/auth-view.php             # Giao diện Auth
includes/pagination.php            # Phân trang dữ liệu mẫu
includes/components/pagination.php # Thanh phân trang dùng chung
data/                             # Dữ liệu minh họa và FAQ
api/                              # Các file PHP trống
SUPABASE_SETUP.md                  # Hướng dẫn kết nối
```

Không có thông tin Supabase của bạn được điền sẵn. Đăng nhập thật chỉ chạy sau khi bạn cấu hình dự án. Các bảng và chính sách RLS cho nghiệp vụ do bạn tự triển khai.