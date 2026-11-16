<?php
// Dữ liệu minh họa cho giao diện. Không phải giao dịch trong tài khoản Supabase.
return [
    ['id' => 3, 'slot' => 6, 'category' => 'PARCEL', 'recipient_email' => 'nhanvien@example.com', 'sender_name' => 'Người gửi minh họa', 'status' => 'ACTIVE', 'created_at' => gmdate('Y-m-d H:i:s', time() - 3600)],
    ['id' => 2, 'slot' => 3, 'category' => 'DRINK', 'recipient_email' => 'dongnghiep@example.com', 'sender_name' => 'Người gửi minh họa', 'status' => 'COLLECTED', 'created_at' => gmdate('Y-m-d H:i:s', time() - 86400)],
    ['id' => 1, 'slot' => 1, 'category' => 'FOOD', 'recipient_email' => 'nhanvien@example.com', 'sender_name' => 'Người gửi minh họa', 'status' => 'CANCELLED', 'created_at' => gmdate('Y-m-d H:i:s', time() - 172800)],
];
