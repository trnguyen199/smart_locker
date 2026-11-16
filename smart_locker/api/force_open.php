<?php
require_once __DIR__ . '/bootstrap.php';

apiRequirePost();
$user = apiUser(true);
$lockerId = apiLockerId();
if (!queryOne('SELECT id FROM lockers WHERE id = ? AND company_id = ?', [$lockerId, $user['company_id']])) throw new ApiError('Không tìm thấy ngăn tủ.', 404, 'NOT_FOUND');

// TODO: Xác thực quyền quản trị và yêu cầu, rồi gửi lệnh mở khóa tới ESP32.
apiNotImplemented('Chưa kết nối thiết bị ESP32. Không có lệnh mở cửa vật lý nào được gửi.');
