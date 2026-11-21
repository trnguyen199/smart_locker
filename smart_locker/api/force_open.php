<?php
/**
 * FILE: api/force_open.php
 * Chức năng: Chỉ dành cho Quản trị Doanh nghiệp (account_type = company).
 * Gửi lệnh mở khóa khẩn cấp từ xa (REMOTE_UNLOCK) xuống mạch ESP32 và ghi nhật ký Audit Log.
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

$patchRes = supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
    'status' => 'OPEN',
    'door_locked' => false,
    'lockout_until' => null,
    'wrong_attempts' => 0,
    'pending_cmd' => 'REMOTE_UNLOCK',
    'updated_at' => gmdate('c'),
], ['Prefer: return=representation']);

if (!$patchRes['ok'] || empty($patchRes['data'])) {
    jsonError('Không tìm thấy ngăn tủ hoặc không cập nhật được lệnh mở khóa.', 404);
}

$locker = $patchRes['data'][0];
logAuditEvent($admin['email'], 'COMPANY_ADMIN', 'FORCE_OPEN', $lockerId, [
    'reason' => trim((string) ($body['reason'] ?? 'Admin emergency override')),
]);

jsonResponse([
    'ok' => true,
    'message' => 'Đã phát lệnh mở khóa khẩn cấp cho Tủ ' . sprintf('%02d', $locker['slot']) . '.',
    'locker' => $locker,
    'mqtt_command' => [
        'cmd' => 'REMOTE_UNLOCK',
        'locker_id' => $lockerId,
        'slot' => (int) $locker['slot'],
        'triggered_by' => 'ADMIN',
        'timestamp' => time(),
    ],
]);
