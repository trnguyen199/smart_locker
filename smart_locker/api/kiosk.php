<?php
/**
 * FILE: api/kiosk.php
 * Phụ trách: Ngọc Hiếu
 * Chức năng: API chuyên biệt dành cho Bản mô phỏng tủ nhiều ngăn (Phạm Vũ Lân) & Mạch giả lập (Duy Quách).
 * Xác thực bằng Header `X-Device-Key` (không yêu cầu người dùng đăng nhập tài khoản cá nhân).
 *
 * - GET  api/kiosk.php (hoặc api.php?action=kiosk_state): Lấy trạng thái 9 ngăn tủ (hoặc ?locker_id=1).
 * - POST api/kiosk.php (hoặc api.php?action=kiosk_door_event): Báo sự kiện đóng/mở cửa tủ & xác nhận lệnh:
 *      + event = "DOOR_CLOSED" (+ locker_id, has_item): Hoàn tất bỏ hàng (WAITING_DROP/OPEN -> OCCUPIED)
 *        hoặc hoàn tất lấy hàng (OPEN -> AVAILABLE).
 *      + event = "DOOR_OPENED" (+ locker_id): Cập nhật cửa mở; tự động phát cảnh báo nếu bị mở trái phép khi OCCUPIED.
 *      + event = "ACK_CMD"     (+ locker_id): Xóa pending_cmd sau khi tủ mô phỏng / mạch đã thực thi.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET', 'POST');
requireIoTDeviceKey();

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// ------------------------------------------------------------------------------
// 1. GET: ĐỌC TRẠNG THÁI TỦ CHO MÀN HÌNH MÔ PHỎNG (LÂN) HOẶC ESP32 (DUY)
// ------------------------------------------------------------------------------
if ($method === 'GET') {
    sweepExpiredBookings();

    $lockerId = (int) ($_GET['locker_id'] ?? 0);
    $query = $lockerId > 0
        ? '/rest/v1/lockers?id=eq.' . $lockerId . '&select=*'
        : '/rest/v1/lockers?select=*&order=slot.asc';

    $res = supabaseRequest('GET', $query);
    if (!$res['ok']) {
        jsonError('Không đọc được trạng thái ngăn tủ từ Supabase.', 502, ['detail' => $res['data']]);
    }

    $rows = is_array($res['data']) ? $res['data'] : [];
    $nowTs = time();
    $sanitized = [];

    foreach ($rows as $l) {
        // Tự động mở khóa trạng thái LOCKOUT nếu đã hết thời gian phạt lockout_until
        $lockUntil = !empty($l['lockout_until']) ? strtotime((string) $l['lockout_until']) : null;
        if (($l['status'] ?? '') === 'LOCKOUT' && ($lockUntil === null || $lockUntil <= $nowTs)) {
            $restoredStatus = !empty($l['has_item']) ? 'OCCUPIED' : (!empty($l['active_receiver_otp']) ? 'WAITING_DROP' : 'AVAILABLE');
            supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . (int) $l['id'], [
                'status' => $restoredStatus,
                'wrong_attempts' => 0,
                'lockout_until' => null,
                'updated_at' => gmdate('c'),
            ], ['Prefer: return=minimal']);
            $l['status'] = $restoredStatus;
            $l['wrong_attempts'] = 0;
            $l['lockout_until'] = null;
        }

        $ai = analyzeThermalHealth($l);
        // Trả dữ liệu đầy đủ cho phần mô phỏng (không trả email cá nhân)
        $sanitized[] = [
            'id' => (int) $l['id'],
            'slot' => (int) $l['slot'],
            'code' => (string) $l['code'],
            'type' => (string) $l['type'],
            'status' => (string) $l['status'],
            'current_temp' => (float) $l['current_temp'],
            'target_temp' => (float) $l['target_temp'],
            'humidity' => (float) ($l['humidity'] ?? 55.0),
            'pwm_power' => (int) ($l['pwm_power'] ?? 0),
            'door_locked' => (bool) ($l['door_locked'] ?? true),
            'has_item' => (bool) ($l['has_item'] ?? false),
            'online' => (bool) ($l['online'] ?? true),
            'active_category' => $l['active_category'] ?? null,
            'wrong_attempts' => (int) ($l['wrong_attempts'] ?? 0),
            'lockout_until' => $l['lockout_until'] ?? null,
            'pending_cmd' => $l['pending_cmd'] ?? null,
            'ai_analysis' => $ai,
        ];
    }

    jsonResponse([
        'ok' => true,
        'count' => count($sanitized),
        'lockers' => $sanitized,
        'server_time' => gmdate('c'),
    ]);
}

// ------------------------------------------------------------------------------
// 2. POST: SỰ KIỆN ĐÓNG / MỞ CỬA TỪ BẢN MÔ PHỎNG (LÂN) HOẶC CÔNG TẮC CỬA (DUY)
// ------------------------------------------------------------------------------
$body = getRequestJson();
$lockerId = (int) ($body['locker_id'] ?? 0);
$event = strtoupper(trim((string) ($body['event'] ?? '')));

if ($lockerId <= 0) {
    jsonError('Thiếu locker_id hợp lệ.', 422);
}
if (!in_array($event, ['DOOR_CLOSED', 'DOOR_OPENED', 'ACK_CMD'], true)) {
    jsonError('event không hợp lệ. Chỉ chấp nhận: DOOR_CLOSED, DOOR_OPENED, ACK_CMD.', 422);
}

$lRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerId . '&select=*');
if (!$lRes['ok'] || empty($lRes['data'])) {
    jsonError('Không tìm thấy ngăn tủ #' . $lockerId, 404);
}
$locker = $lRes['data'][0];

if ($event === 'ACK_CMD') {
    $patch = supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'pending_cmd' => null,
        'last_ping_at' => gmdate('c'),
        'updated_at' => gmdate('c'),
    ], ['Prefer: return=representation']);

    jsonResponse([
        'ok' => true,
        'message' => 'Đã xác nhận thực thi lệnh cho Tủ ' . sprintf('%02d', $lockerId),
        'locker' => $patch['data'][0] ?? $locker,
    ]);
}

if ($event === 'DOOR_OPENED') {
    $curStatus = strtoupper((string) ($locker['status'] ?? 'AVAILABLE'));
    $hasValidUnlock = !empty($locker['pending_cmd']) || $curStatus === 'OPEN' || !$locker['door_locked'];

    $patch = supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'door_locked' => false,
        'status' => ($curStatus === 'AVAILABLE') ? 'OPEN' : $curStatus,
        'last_ping_at' => gmdate('c'),
        'updated_at' => gmdate('c'),
    ], ['Prefer: return=representation']);

    // [VẤN ĐÁP]: Nếu tủ đang chứa hàng (OCCUPIED) mà cửa bị mở không qua OTP/Admin -> ghi cảnh báo cạy cửa!
    if ($curStatus === 'OCCUPIED' && !$hasValidUnlock) {
        supabaseRequest('POST', '/rest/v1/alerts', [
            'locker_id' => $lockerId,
            'severity' => 'CRITICAL',
            'message' => 'Cảnh báo an ninh: Cửa Tủ ' . sprintf('%02d', $lockerId) . ' bị mở trái phép khi chưa xác thực OTP!',
            'resolved' => false,
        ], ['Prefer: return=minimal']);
    }

    logAuditEvent('kiosk@smartlocker.local', 'IOT_KIOSK', 'DOOR_OPENED', $lockerId, ['unauthorized' => !$hasValidUnlock]);

    jsonResponse([
        'ok' => true,
        'message' => 'Đã ghi nhận mở cửa Tủ ' . sprintf('%02d', $lockerId),
        'locker' => $patch['data'][0] ?? $locker,
    ]);
}

// event === 'DOOR_CLOSED'
$hasItem = isset($body['has_item']) ? (bool) $body['has_item'] : (bool) ($locker['has_item'] ?? false);
$hasActiveOrder = !empty($locker['active_receiver_otp']);
$nextStatus = ($hasItem || $hasActiveOrder) ? 'OCCUPIED' : 'AVAILABLE';

$updatePayload = [
    'door_locked' => true,
    'has_item' => $hasItem,
    'status' => $nextStatus,
    'pending_cmd' => null,
    'last_ping_at' => gmdate('c'),
    'updated_at' => gmdate('c'),
];

if ($nextStatus === 'AVAILABLE') {
    $updatePayload['active_category'] = null;
    $updatePayload['active_shipper_otp'] = null;
    $updatePayload['active_receiver_otp'] = null;
    $updatePayload['target_temp'] = (($locker['type'] ?? 'NORMAL') === 'COOL') ? 8.0 : 25.0;
}

$patch = supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, $updatePayload, ['Prefer: return=representation']);
$updated = $patch['data'][0] ?? array_merge($locker, $updatePayload);

logAuditEvent('kiosk@smartlocker.local', 'IOT_KIOSK', 'DOOR_CLOSED', $lockerId, [
    'has_item' => $hasItem,
    'next_status' => $nextStatus,
]);

jsonResponse([
    'ok' => true,
    'message' => $nextStatus === 'OCCUPIED'
        ? 'Đã đóng cửa Tủ ' . sprintf('%02d', $lockerId) . ' — Bắt đầu bảo quản hàng ở ' . $updated['target_temp'] . '°C.'
        : 'Đã đóng cửa Tủ ' . sprintf('%02d', $lockerId) . ' — Tủ trở về trạng thái Trống.',
    'locker' => $updated,
]);
