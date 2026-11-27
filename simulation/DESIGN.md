# Dàn tủ giao nhận đồ ăn — thiết kế demo

## Mục tiêu

Bảng điều khiển IoT tiếng Việt cho một dàn tủ giao nhận 5×6. Lưới cửa kính trắng và dải biển xanh/đỏ gợi cấu trúc quan sát được trong video Z Lab Robotics. Số 30 là cấu hình demo, không phải thông số được xác nhận của nguyên mẫu.

## Hệ hình ảnh

CSS trong `frontend/src/styles.css` là nguồn token màu: nền xám xanh `#edf3f5`, mặt trắng, chữ xanh đậm `#18364a`, accent `#176b8b`, lạnh cyan, nóng cam đỏ, nhấn biển `#e64f67`. Bahnschrift/Segoe UI cho tiêu đề và nội dung tiếng Việt; Consolas cho số liệu. Panel bo 15px, điều khiển 6–8px. Màu vật liệu mô hình nằm trong `LockerScene.tsx` vì diễn tả khung nhôm/kính thực tế.

## Bố cục và hành vi

Tổng quan → mô hình 3D lớn → panel điều khiển ngăn đang chọn → nhật ký. Desktop có hai cột, màn hình hẹp xếp theo chiều dọc. Mỗi ô có mã A1–E6. Màn hình cảm ứng được vẽ bằng CanvasTexture ngay trên mặt phẳng 3D: UV của mặt phẳng cũng dùng để xác định ô/phím được chạm, tránh lệch hình và vùng bấm do lớp HTML chồng lên. Màn hình hiện ô trống màu xanh để gửi và ô có hàng màu cam để nhận; sau khi chọn ô mới hiện bàn phím OTP. Đặt hàng tự tạo OTP nhận mới, chỉ trả cho dashboard phiên yêu cầu. Người nhận chọn ô có hàng, xác thực mã mới và đánh dấu đã lấy; cửa tự đóng sau 30 giây nếu còn mở. Khoang nước/bánh dưới màn hình có tồn kho riêng. Mọi thay đổi đi qua API và trạng thái Socket.IO. Cửa riêng từng ô xoay quanh bản lề phải. COOL/HEAT có dải khí, đèn viền màu rõ hơn và quạt quay minh họa; thẻ trạng thái bên phải hiển thị mức công suất từ backend, ưu tiên giảm chuyển động khi hệ điều hành yêu cầu. OTP không nằm trong trạng thái công khai. Khung mô hình là hình học dựng lại, GLB một ngăn cũ chưa chứng minh được rig đa ngăn.

## Giới hạn

Mô phỏng nhiệt không được kiểm chứng vật lý. Bản demo chạy localhost và lưu trạng thái RAM. Không suy ra sơ đồ điện chính xác hay số ngăn thực từ video.
