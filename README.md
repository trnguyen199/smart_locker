# Dàn tủ giao nhận đồ ăn · Digital Twin

Mô phỏng phần mềm chạy localhost, lấy cảm hứng từ hai video Z Lab Robotics do nhóm cung cấp. Bản demo hiển thị 5 hàng × 6 cột (30 ngăn), khung nhôm sáng, cửa kính riêng từng ô, bảng điều khiển mỗi ngăn và Peltier/đảo cực. Con số 30 là lựa chọn demo: video không cung cấp kích thước và sơ đồ kỹ thuật để sao chép chính xác. Không sử dụng tài sản hoặc mã của video.

## Chạy trên Windows PowerShell

Cài Node.js 24, sau đó mở PowerShell tại thư mục này:

```powershell
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Mở http://127.0.0.1:5173, giữ terminal đang chạy. Backend ở http://127.0.0.1:3001. Ctrl+C để dừng. Các trạng thái lưu trong RAM và sẽ mất khi restart. Vite proxy `/api` và `/socket.io` về backend.

## Thao tác demo

1. Trên dashboard, chọn **ô trống** rồi bấm **Tạo OTP gửi hàng**. Chuyển mã demo cho shipper thủ công; ứng dụng chưa gửi tin nhắn tự động.
2. Bấm **Phóng tới màn hình cảm ứng** trên cảnh 3D. Shipper chọn ô màu xanh, nhập OTP đã cấp, `*` xóa và `#` xác nhận. OTP 6 số chỉ dùng một lần, hiệu lực 5 phút; sai 5 lần tạm khóa ô đó 60 giây.
3. Khi cửa mở, bấm **Đã bỏ hàng**. Backend tạo **OTP nhận hàng mới** và chỉ trả mã này trong phản hồi; dashboard hiển thị để bạn chuyển cho người nhận. Cửa tự đóng và khóa sau 30 giây kể từ khi mở, hoặc bấm **Đóng cửa ngay**.
4. Người nhận chọn lại **ô màu cam (có hàng)** trên màn hình và nhập OTP nhận hàng. Cửa mở; bấm **Đã lấy hàng** để cập nhật ô trống và đóng cửa. Nếu mã nhận hàng hết hạn, chọn ô đó trên dashboard và bấm **Tạo OTP nhận hàng** để thay mã cũ.
5. Chọn COOL (5–20°C), HEAT (30–45°C), OFF trên dashboard và bấm áp dụng. Ô tủ hiện ánh xanh/cam, dải khí chuyển động, đèn viền và quạt quay; thẻ trạng thái bên phải hiện công suất. Hiệu ứng là minh họa trực quan, nhiệt độ vẫn theo mô hình backend. Bấm sản phẩm trong khoang nước/đồ ăn vặt để giảm tồn kho.

## Hợp đồng API

`GET /api/status`, `GET /api/lockers` trả `{revision,serverTime,rows,columns,lockers,vending}`. `GET /api/events` trả tối đa 200 sự kiện, mới nhất trước. Mỗi ngăn có ID A1–E6, `autoCloseAt` và metadata OTP nhưng **không có mã OTP**.

| Endpoint                             | Body / kết quả                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `POST /api/lockers/:id/temperature`  | `{ "mode": "COOL", "target": 15 }` hoặc HEAT/OFF                                        |
| `POST /api/lockers/:id/otp/generate` | `{}` → `{code,expiresAt}` chỉ trong phản hồi này                                        |
| `POST /api/lockers/:id/otp/verify`   | `{code}` → mở khóa cửa ngăn đó                                                          |
| `POST /api/lockers/:id/parcel`       | `LOADED` tạo và trả `pickupOtp` trong phản hồi; `EMPTY` đánh dấu đã lấy, yêu cầu cửa mở |
| `POST /api/lockers/:id/door/close`   | `{}` → đóng và khóa                                                                     |

Socket.IO gửi `status` toàn dàn tủ, `temperature` toàn dàn tủ; `mode`, `door`, `otp`, `parcel` gồm `{lockerId,locker,revision}`; `event` và `events` cho nhật ký. API chỉ bind loopback và có Origin allowlist cho demo. Trước khi đưa ra Internet cần xác thực, phân quyền tạo OTP, lưu trữ bền vững và TLS.

## Mô hình 3D và nhiệt

Dàn tủ được dựng lại bằng React Three Fiber với cửa kính và bản lề riêng ở từng ngăn. GLB cũ `Smart_Locker_V2_OPEN.glb` là mô hình **một ngăn**, chưa có trong gói nguồn và không được kéo giãn thành cả dàn tủ. Nếu muốn tham khảo GLB, đặt tại `frontend/public/models/Smart_Locker_V2_OPEN.glb` và chạy `node scripts/inspect-glb.mjs` để kiểm tra node/mesh/animation trước khi viết adapter. Mô hình hình khối hiện có là fallback chủ động cho cấu hình dàn tủ.

Mỗi ngăn có một `SimpleThermalModel` độc lập. Nhiệt độ môi trường 28°C, công suất Peltier có quán tính, OFF dần về môi trường, mở cửa tăng trao đổi nhiệt. Mô hình này phục vụ trình diễn, **chưa được kiểm chứng vật lý**. Interface `ThermalModel` ở `backend/src/simulation/thermal.ts` là điểm thay bằng Python về sau. Wokwi/ESP32 và Kotlin chưa tích hợp.

## Cấu trúc

- `frontend/src/scenes/LockerScene.tsx`: dàn tủ 3D 30 cửa.
- `frontend/src/App.tsx`: dashboard, cấp OTP demo và điều khiển.
- `frontend/src/hooks/useLocker.ts`: API và Socket.IO.
- `backend/src/app.ts`: API, sự kiện, 30 module độc lập.
- `backend/src/services/otp.ts`: OTP hash, một lần và khóa tạm.
- `backend/src/simulation/thermal.ts`: mô phỏng nhiệt.
- `backend/test`: logic và API/Socket.IO.
