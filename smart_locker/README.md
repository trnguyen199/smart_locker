# Smart Locker

Giao diện PHP cho người dùng và trang quản trị hệ thống tủ giao nhận hàng.

## Cấu trúc thư mục

```text
smart_locker/
├── index.php                       # Trang gửi / nhận hàng
├── admin.php                       # Trang quản trị
├── api.php                         # Bộ định tuyến tương thích URL API cũ
├── api/
│   ├── bootstrap.php               # Phản hồi JSON, phương thức, kiểm tra đầu vào
│   ├── create_booking.php          # API tạo đơn gửi hàng
│   ├── verify_otp.php              # API xác thực OTP nhận hàng
│   ├── force_open.php              # API mở khóa khẩn cấp
│   └── reset_locker.php            # API đặt lại tủ / hủy đơn
├── assets/
│   ├── css/style.css               # CSS giao diện
│   ├── js/api.js                   # Hàm gọi API dùng chung
│   ├── js/locker.js                # Chọn tủ, nhiệt độ, OTP
│   ├── js/admin.js                 # Thao tác quản trị
│   └── images/                     # Đặt ảnh, logo, banner tại đây
├── data/
│   ├── lockers.php                 # Dữ liệu mẫu trang người dùng
│   └── admin-lockers.php           # Dữ liệu mẫu trang quản trị
└── includes/
    ├── pagination.php              # Tính toán phân trang
    └── components/pagination.php   # Giao diện phân trang dùng chung
```

Đường dẫn ảnh trong trang PHP: `<img src="assets/images/ten-anh.png" alt="Mô tả ảnh">`.
Trong `assets/css/style.css`, dùng `url('../images/ten-anh.png')`.

## Chạy dự án

Cần PHP 7.4 trở lên. Chạy từ thư mục `smart_locker`:

```sh
php -S localhost:8000
```

Mở `http://localhost:8000/index.php` hoặc `http://localhost:8000/admin.php`.
Bootstrap hiện được tải từ CDN nên cần kết nối Internet để hiển thị đầy đủ giao diện.

## Phân trang

Cả hai trang có 9 tủ mẫu, bố trí thành lưới **3 × 3** với các ô vuông cùng kích thước. Lưới giữ 3 cột trên cả điện thoại. Ở trang người dùng, chọn ô tủ trống để gửi hàng; ở trang quản trị, chọn ô tủ để mở thông tin chi tiết và các nút điều khiển.

Mặc định hiển thị 9 tủ mỗi trang. Có thể chọn 9, 18 hoặc 27 tủ mỗi trang rồi nhấn **Áp dụng**; thay đổi số tủ sẽ quay về trang đầu. Ví dụ URL phân trang: `?page=2&per_page=9`. Với 9 tủ hiện tại, toàn bộ danh sách nằm trên trang đầu; phân trang tiếp tục hoạt động khi có thêm tủ.

Trang vượt giới hạn được đưa về trang cuối. Giá trị không hợp lệ được đưa về mặc định. Danh sách trống vẫn hiển thị bình thường. Thống kê quản trị được tính trên toàn bộ danh sách, độc lập với trang đang xem.

Các dữ liệu trong `data/` là hai bộ dữ liệu mẫu độc lập của giao diện ban đầu. Khi kết nối cơ sở dữ liệu, thay chúng bằng truy vấn phù hợp; với dữ liệu lớn nên dùng `COUNT(*)` và `LIMIT` / `OFFSET` ở phía cơ sở dữ liệu.

## API

Mỗi thao tác có một endpoint riêng, nhận **POST** với body `application/x-www-form-urlencoded`:

| Endpoint | Tham số | Hàm JavaScript |
| --- | --- | --- |
| `api/create_booking.php` | `locker_id`, `category` (`FOOD`, `DRINK`, `PARCEL`), `target_temp` (2–25°C) | `SmartLockerApi.createBooking(lockerId, category, targetTemp)` |
| `api/verify_otp.php` | `otp` (đúng 6 chữ số) | `SmartLockerApi.verifyOtp(otp)` |
| `api/force_open.php` | `locker_id` | `SmartLockerApi.forceOpen(lockerId)` |
| `api/reset_locker.php` | `locker_id` | `SmartLockerApi.resetLocker(lockerId)` |

`locker_id` phải là số nguyên dương. `assets/js/api.js` xử lý gửi yêu cầu và lỗi JSON dùng chung. File này được tải trước `locker.js` hoặc `admin.js`.

Các endpoint hiện là khung triển khai backend: trả JSON với HTTP `405` nếu sai phương thức, `422` nếu dữ liệu không hợp lệ, và `501` / `NOT_IMPLEMENTED` nếu dữ liệu hợp lệ nhưng chưa có backend. Không có thao tác ghi dữ liệu hay mở cửa phần cứng. Các URL cũ như `api.php?action=create_booking` được chuyển vào đúng file xử lý; action không tồn tại trả `404`.

Giao diện gửi / nhận hàng và quản trị tiếp tục chạy mô phỏng. Khi triển khai backend, hoàn thiện phần TODO trong từng endpoint rồi thay phần mô phỏng bằng lời gọi `SmartLockerApi` đã ghi chú trong `locker.js` và `admin.js`. Các thao tác quản trị cần được xác thực quyền ở backend trước khi triển khai chức năng thực tế.
