<?php
// DỮ LIỆU MẪU (Thay bằng truy vấn JOIN bảng lockers & bookings từ MySQL)
return [
    [
        'id' => 1, 'code' => 'TỦ 01 (NGĂN MÁT)', 'type' => 'COOL', 'status' => 'OCCUPIED',
        'current_temp' => 7.5, 'target_temp' => 8.0, 'esp_online' => true, 'last_ping' => '2 giây trước',
        'category' => 'FOOD', 'otp' => '482910'
    ],
    [
        'id' => 2, 'code' => 'TỦ 02 (NGĂN THƯỜNG)', 'type' => 'NORMAL', 'status' => 'AVAILABLE',
        'current_temp' => 26.2, 'target_temp' => 25.0, 'esp_online' => true, 'last_ping' => '3 giây trước',
        'category' => null, 'otp' => null
    ],
    [
        'id' => 3, 'code' => 'TỦ 03 (NGĂN MÁT)', 'type' => 'COOL', 'status' => 'OCCUPIED',
        'current_temp' => 19.5, 'target_temp' => 5.0, 'esp_online' => true, 'last_ping' => '1 giây trước',
        'category' => 'DRINK', 'otp' => '993104' // Chênh lệch nhiệt độ cao -> Tự cảnh báo lỗi làm lạnh
    ],
    [
        'id' => 4, 'code' => 'TỦ 04 (NGĂN THƯỜNG)', 'type' => 'NORMAL', 'status' => 'ERROR',
        'current_temp' => 0.0, 'target_temp' => 25.0, 'esp_online' => false, 'last_ping' => '2 phút trước',
        'category' => null, 'otp' => null // Mất kết nối mạch
    ],
    [
        'id' => 5, 'code' => 'TỦ 05 (NGĂN MÁT)', 'type' => 'COOL', 'status' => 'AVAILABLE',
        'current_temp' => 7.9, 'target_temp' => 8.0, 'esp_online' => true, 'last_ping' => '2 giây trước',
        'category' => null, 'otp' => null
    ],
    [
        'id' => 6, 'code' => 'TỦ 06 (NGĂN THƯỜNG)', 'type' => 'NORMAL', 'status' => 'OCCUPIED',
        'current_temp' => 25.6, 'target_temp' => 25.0, 'esp_online' => true, 'last_ping' => '1 giây trước',
        'category' => 'PARCEL', 'otp' => '173826'
    ],
    [
        'id' => 7, 'code' => 'TỦ 07 (NGĂN MÁT)', 'type' => 'COOL', 'status' => 'AVAILABLE',
        'current_temp' => 5.5, 'target_temp' => 5.0, 'esp_online' => true, 'last_ping' => '3 giây trước',
        'category' => null, 'otp' => null
    ],
    [
        'id' => 8, 'code' => 'TỦ 08 (NGĂN THƯỜNG)', 'type' => 'NORMAL', 'status' => 'AVAILABLE',
        'current_temp' => 26.1, 'target_temp' => 25.0, 'esp_online' => true, 'last_ping' => '2 giây trước',
        'category' => null, 'otp' => null
    ],
    [
        'id' => 9, 'code' => 'TỦ 09 (NGĂN MÁT)', 'type' => 'COOL', 'status' => 'AVAILABLE',
        'current_temp' => 8.1, 'target_temp' => 8.0, 'esp_online' => true, 'last_ping' => '1 giây trước',
        'category' => null, 'otp' => null
    ]
];
