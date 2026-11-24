# Kiểm tra phiên 18/11/2026

- `npm install`: cài 245 gói thành công.
- `npm test`: 16/16 bài đạt; có kiểm thử API/Socket.IO dàn 30 ngăn, OTP gửi hàng rồi OTP nhận hàng riêng, mã không lộ trong trạng thái công khai/nhật ký, tự đóng cửa sau hạn, hủy timer khi đóng thủ công, đảo cực và tọa độ vùng chạm trùng với 30 ô/phím vẽ trên màn hình.
- `npm run typecheck`: đạt cả frontend/backend.
- `npm run build`: đạt Vite và TypeScript backend. Vite cảnh báo bundle 1.32 MB chưa tách chunk.
- `npm run format:check`: đạt, tất cả file theo Prettier.
- `npm run dev`: in URL frontend/backend. API trả 5 × 6 = 30 ngăn.
- Headless Chromium trong môi trường này không khởi động được (`socket() failed: Operation not permitted`); chưa xác nhận trực quan bản cập nhật qua trình duyệt. Lớp HTML chồng cũ đã được bỏ; màn hình là texture trên chính mặt phẳng nhận raycast.
