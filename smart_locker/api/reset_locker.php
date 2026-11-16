<?php
require_once __DIR__ . '/bootstrap.php';

apiRequirePost();
$user = apiUser(true);
$lockerId = apiLockerId();

atomic(function () use ($user, $lockerId) {
    $locker = queryOne('SELECT * FROM lockers WHERE id = ? AND company_id = ?', [$lockerId, $user['company_id']]);
    if (!$locker) throw new ApiError('Không tìm thấy ngăn tủ.', 404, 'NOT_FOUND');
    if (!$locker['online'] || $locker['status'] === 'ERROR') throw new ApiError('Tủ đang bảo trì, cần kiểm tra thiết bị trước khi đặt lại.', 409, 'LOCKER_UNAVAILABLE');
    executeSql("UPDATE bookings SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE locker_id = ? AND company_id = ? AND status = 'ACTIVE'", [$lockerId, $user['company_id']]);
    executeSql("UPDATE lockers SET status = 'AVAILABLE' WHERE id = ? AND company_id = ?", [$lockerId, $user['company_id']]);
});
apiResponse(['status' => 'success', 'message' => 'Đã hủy giao dịch và đặt lại tủ trong chế độ mô phỏng.', 'simulation' => true]);
