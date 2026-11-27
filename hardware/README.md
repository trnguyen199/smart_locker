# Mạch Smart Locker trên Wokwi

## Phạm vi bàn giao

Ba sơ đồ kết nối cho 9 ngăn theo mã và loại ngăn trong nhánh main của repo trnguyen199/smart_locker. Nguồn đối chiếu là smart_locker/data/lockers.php, smart_locker/lockers.php và smart_locker/assets/js/locker.js.

Mỗi node là một dự án Wokwi độc lập có một ESP32 DevKitC V4 quản lý ba ngăn. Node 1 quản lý ngăn 1–3, node 2 quản lý ngăn 4–6, node 3 quản lý ngăn 7–9. Các ngăn 1, 3, 5, 7, 9 là COOL. Các ngăn 2, 4, 6, 8 là NORMAL.

Repo đã kiểm tra có phần web và dữ liệu mẫu, chưa có firmware ESP32 hoặc sơ đồ GPIO. Việc chia ba ESP32, chọn servo, DS18B20, công tắc cửa và bảng GPIO là thiết kế phần cứng bổ sung. Mạch khớp mã ngăn và chức năng trên giao diện. Chức năng chạy và kết nối web cần firmware cùng API của nhóm.

## Cách mở và chạy trực tiếp trên Wokwi (`wokwi.com`)

Đã bổ sung đầy đủ `sketch.ino` và `libraries.txt` cho cả 3 node (`node_1`, `node_2`, `node_3` — mỗi mạch 3 ngăn gọn gàng) kết nối hai chiều với Web App & Mô phỏng 3D qua EMQX MQTT (`broker.emqx.io:1883`, prefix `uth/iot/smartlocker/nhom4_trnguyen199`):

1. Mở https://wokwi.com/projects/new/esp32 cho từng node (Node 1: Ngăn 01–03, Node 2: Ngăn 04–06, Node 3: Ngăn 07–09).
2. Dán nội dung file `diagram.json` vào tab `diagram.json`, file `sketch.ino` vào tab `sketch.ino`, và thêm các thư viện trong `libraries.txt` (`PubSubClient`, `ArduinoJson`, `ESP32Servo`, `OneWire`, `DallasTemperature`) vào tab **Library Manager** (hoặc `libraries.txt`).
3. Chạy `.\start-demo.ps1` ở thư mục gốc `smart_locker/`, sau đó bấm **Start the simulation (Play)** trên Wokwi — thanh trạng thái trên Web sẽ tự động hiện **`Wokwi MQTT: Node ... online`** và đồng bộ Servo, Công tắc cửa, Relay làm mát & cảm biến DS18B20 theo thời gian thực.

## Bảng chân GPIO

| Node | ID ngăn | Loại | Servo PWM | Công tắc cửa | DS18B20 DQ | Relay làm mát IN |
|---|---|---|---|---|---|---|
| 1 | 1 | COOL | 13 | 32 | 16 | 26 |
| 1 | 2 | NORMAL | 14 | 33 | 17 | Không có |
| 1 | 3 | COOL | 27 | 25 | 18 | 19 |
| 2 | 4 | NORMAL | 13 | 32 | 16 | Không có |
| 2 | 5 | COOL | 14 | 33 | 17 | 23 |
| 2 | 6 | NORMAL | 27 | 25 | 18 | Không có |
| 3 | 7 | COOL | 13 | 32 | 16 | 26 |
| 3 | 8 | NORMAL | 14 | 33 | 17 | Không có |
| 3 | 9 | COOL | 27 | 25 | 18 | 19 |

## Quy ước nối dây và điều khiển

- Servo dùng V+ nối 5V và GND chung. Góc 0 độ mô phỏng khóa, 90 độ mô phỏng mở chốt.
- Công tắc cửa nối chân 2 vào GPIO và chân 1 vào GND. Firmware cấu hình INPUT_PULLUP. Gạt trái là cửa đóng, mức LOW. Gạt phải là cửa mở, mức HIGH. Thuộc tính bounce=0 giúp mô phỏng trạng thái cửa ổn định.
- DS18B20 dùng 3V3 và GND. Mỗi DQ có điện trở 4,7 kΩ kéo lên 3V3, dùng một bus riêng theo bảng. Các cảm biến có deviceID riêng.
- Relay ngăn mát dùng 5V, GND và chân IN trong bảng. Thuộc tính transistor=npn. Theo phần Operation trong tài liệu Wokwi, IN=LOW nối COM với NO. Cần kiểm tra lại chiều kích khi tích hợp firmware do tài liệu có mô tả active-high/active-low chưa thống nhất giữa các mục.
- LED xanh dương được mắc qua điện trở 330 Ω ở tiếp điểm NO để biểu diễn bộ làm mát. Đây là tải mô phỏng và không tự thay đổi nhiệt độ DS18B20.
- Dây đỏ là nguồn, đen là GND, cam là servo, xanh lá là cửa, xanh dương là nhiệt độ, tím là lệnh làm mát.
- OTP được nhập trên web theo lockers.php?mode=receive. Sơ đồ dùng giao diện web chung để hiển thị thông tin, không bổ sung keypad hoặc LCD.
- Trạng thái hàng trống/đang dùng lấy từ giao dịch của backend. Công tắc cửa chỉ cho biết đóng/mở.

## Dữ liệu ban đầu

Giá trị nhiệt độ từng DS18B20 được đặt theo data/lockers.php. Giá trị này là điểm khởi tạo mô phỏng. Có thể bấm cảm biến để thay đổi nhiệt độ trên Wokwi. Trạng thái OCCUPIED và AVAILABLE trong repo là dữ liệu giao dịch mẫu, không được suy ra từ góc servo hoặc vị trí công tắc.

## Kiểm tra đã thực hiện

Đã kiểm tra cú pháp JSON, ID linh kiện duy nhất, tên chân các đầu nối, phân loại đủ 5 ngăn mát và 4 ngăn thường, bảng GPIO khớp cả ba sơ đồ. Chưa mở kiểm tra bố cục trên Wokwi và chưa chạy mô phỏng với firmware của nhóm.

## Tài liệu linh kiện

- https://docs.wokwi.com/parts/wokwi-ds18b20
- https://docs.wokwi.com/parts/wokwi-servo
- https://docs.wokwi.com/parts/wokwi-slide-switch
- https://docs.wokwi.com/parts/wokwi-relay-module
