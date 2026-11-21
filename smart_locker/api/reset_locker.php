<?php
/**
 * FILE: api/reset_locker.php
 * Chức năng: Chỉ dành cho Quản trị Doanh nghiệp.
 * Hủy giao dịch đang ACTIVE trên ngăn tủ, xóa cảnh báo lỗi, đưa tủ về trạng thái AVAILABLE và gửi lệnh RESET xuống ESP32.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('POST');

$admin = requireAuthUser(true);
$body = getRequestJson();
$lockerId = (int) ($body['locker_id'] ?? 0);

if ($lockerId <= 0) {
    jsonError('Thiếu mã ngăn tủ (locker_id).', 422);
}

// 1. Hủy các giao dịch đang ACTIVE trên ngăn tủ này
supabaseRequest('PATCH', '/rest/v1/bookings?locker_id=eq.' . $lockerId . '&status=eq.ACTIVE', [
    'status' => 'CANCELLED',
]);

// 2. Đóng các cảnh báo chưa xử lý của tủ này
supabaseRequest('PATCH', '/rest/v1/alerts?locker_id=eq.' . $lockerId . '&resolved=eq.false', [
    'resolved' => true,
]);

// 3. Đặt lại trạng thái tủ về AVAILABLE
$defaultTemp = ($lockerId % 2 === 1) ? 8.0 : 25.0;
$patchRes = supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
    'status' => 'AVAILABLE',
    'target_temp' => $defaultTemp,
    'door_locked' => true,
    'has_item' => false,
    'active_category' => null,
    'active_shipper_otp' => null,
    'active_receiver_otp' => null,
    'wrong_attempts' => 0,
    'lockout_until' => null,
    'online' => true,
    'pending_cmd' => 'REMOTE_LOCK',
    'updated_at' => gmdate('c'),
], ['Prefer: return=representation']);

if (!$patchRes['ok'] || empty($patchRes['data'])) {
    jsonError('Không đặt lại được ngăn tủ #' . $lockerId, 404);
}

$locker = $patchRes['data'][0];
logAuditEvent($admin['email'], 'COMPANY_ADMIN', 'RESET_LOCKER', $lockerId);

jsonResponse([
    'ok' => true,
    'message' => 'Đã đặt lại Tủ ' . sprintf('%02d', $locker['slot']) . ' về trạng thái Trống và hủy giao dịch cũ.',
    'locker' => $locker,
    'mqtt_command' => [
        'cmd' => 'REMOTE_LOCK',
        'locker_id' => $lockerId,
        'slot' => (int) $locker['slot'],
        'reset' => true,
        'timestamp' => time(),
    ],
]);
