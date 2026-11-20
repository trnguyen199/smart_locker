<?php
/**
 * FILE: api/lockers.php
 * Chức năng:
 * - GET: Trả danh sách 9 ngăn tủ, thống kê, danh sách giao dịch gần đây và kết quả phân tích AI nhiệt học.
 * - POST: Nhận gói tin Telemetry từ mạch ESP32/Wokwi (hoặc Virtual Simulator), chạy phân tích AI, lưu log
 *         và trả về lệnh chờ (pending_cmd) để mạch thực thi ngay.
 * - PATCH: (Admin) Chỉnh nhiệt độ mục tiêu trực tiếp cho một ngăn tủ.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET', 'POST', 'PATCH');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

// ------------------------------------------------------------------------------
// 1. GET: LẤY TRẠNG THÁI 9 NGĂN TỦ + LỊCH SỬ + CẢNH BÁO AI
// ------------------------------------------------------------------------------
if ($method === 'GET') {
    $user = requireAuthUser(false);

    $lockersRes = supabaseRequest('GET', '/rest/v1/lockers?select=*&order=slot.asc');
    if (!$lockersRes['ok']) {
        jsonError('Không đọc được danh sách tủ từ Supabase.', 502, ['detail' => $lockersRes['data']]);
    }
    $lockers = is_array($lockersRes['data']) ? $lockersRes['data'] : [];

    // Lấy bookings (Công ty xem tất cả; Cá nhân xem đơn mình gửi hoặc nhận)
    $bookingQuery = '/rest/v1/bookings?select=*&order=created_at.desc&limit=50';
    if (!$user['is_company']) {
        $emailEnc = rawurlencode($user['email']);
        $bookingQuery = '/rest/v1/bookings?select=*&or=(sender_email.eq.' . $emailEnc . ',recipient_email.eq.' . $emailEnc . ')&order=created_at.desc&limit=50';
    }
    $bookingsRes = supabaseRequest('GET', $bookingQuery);
    $bookings = ($bookingsRes['ok'] && is_array($bookingsRes['data'])) ? $bookingsRes['data'] : [];

    // Gắn kết quả AI phân tích nhiệt học vào từng tủ
    $enrichedLockers = [];
    $issueCount = 0;
    $availableCount = 0;
    $occupiedCount = 0;

    foreach ($lockers as $l) {
        $ai = analyzeThermalHealth($l);
        $l['ai_analysis'] = $ai;
        if (($l['status'] ?? '') === 'AVAILABLE') {
            $availableCount++;
        } elseif (($l['status'] ?? '') === 'OCCUPIED') {
            $occupiedCount++;
        }
        if (($l['status'] ?? '') === 'ERROR' || empty($l['online']) || $ai['has_anomaly']) {
            $issueCount++;
        }
        // Ẩn mã OTP khỏi API trả về cho người không phải admin
        if (!$user['is_company']) {
            unset($l['active_shipper_otp'], $l['active_receiver_otp']);
        }
        $enrichedLockers[] = $l;
    }

    // Lấy danh sách cảnh báo mới nhất
    $alertsRes = supabaseRequest('GET', '/rest/v1/alerts?select=*&resolved=eq.false&order=created_at.desc&limit=15');
    $alerts = ($alertsRes['ok'] && is_array($alertsRes['data'])) ? $alertsRes['data'] : [];

    jsonResponse([
        'ok' => true,
        'stats' => [
            'total' => count($enrichedLockers),
            'available' => $availableCount,
            'occupied' => $occupiedCount,
            'issues' => $issueCount,
            'active_bookings' => count(array_filter($bookings, fn($b) => ($b['status'] ?? '') === 'ACTIVE')),
        ],
        'lockers' => $enrichedLockers,
        'bookings' => $bookings,
        'alerts' => $alerts,
        'server_time' => gmdate('c'),
    ]);
}

// ------------------------------------------------------------------------------
// 2. PATCH: ADMIN CẬP NHẬT NHIỆT ĐỘ MỤC TIÊU TRỰC TIẾP
// ------------------------------------------------------------------------------
if ($method === 'PATCH') {
    $admin = requireAuthUser(true);
    $body = getRequestJson();
    $lockerId = (int) ($body['locker_id'] ?? 0);
    $targetTemp = isset($body['target_temp']) ? (float) $body['target_temp'] : null;

    if ($lockerId <= 0 || $targetTemp === null || $targetTemp < 2.0 || $targetTemp > 65.0) {
        jsonError('locker_id không hợp lệ hoặc nhiệt độ ngoài dải an toàn (2°C – 65°C).', 422);
    }

    $patchRes = supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'target_temp' => $targetTemp,
        'pending_cmd' => 'SET_TEMP',
        'updated_at' => gmdate('c'),
    ], ['Prefer: return=representation']);

    if (!$patchRes['ok'] || empty($patchRes['data'])) {
        jsonError('Không cập nhật được nhiệt độ tủ.', 500, ['detail' => $patchRes['data']]);
    }

    logAuditEvent($admin['email'], 'COMPANY_ADMIN', 'SET_TEMP', $lockerId, ['target_temp' => $targetTemp]);

    jsonResponse([
        'ok' => true,
        'message' => 'Đã cập nhật nhiệt độ mục tiêu ' . $targetTemp . '°C cho Tủ ' . sprintf('%02d', $lockerId),
        'locker' => $patchRes['data'][0],
    ]);
}

// ------------------------------------------------------------------------------
// 3. POST: NHẬN TELEMETRY TỪ MẠCH ESP32 / WOKWI HOẶC VIRTUAL SIMULATOR
// ------------------------------------------------------------------------------
$isDeviceCall = isset($_SERVER['HTTP_X_DEVICE_KEY']) || (($_GET['source'] ?? '') === 'iot');
if ($isDeviceCall) {
    requireIoTDeviceKey();
} else {
    // Cho phép Admin đẩy dữ liệu từ Virtual Simulator trên trình duyệt
    requireAuthUser(true);
}

$body = getRequestJson();
$lockerId = (int) ($body['locker_id'] ?? 1);
if ($lockerId <= 0) {
    jsonError('Thiếu locker_id hợp lệ.', 422);
}

// Đọc trạng thái cũ để tính tốc độ biến thiên nhiệt (dT/dt) cho AI Thermal Analyzer
$oldRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerId . '&select=*');
if (!$oldRes['ok'] || empty($oldRes['data'])) {
    jsonError('Không tìm thấy ngăn tủ #' . $lockerId, 404);
}
$oldLocker = $oldRes['data'][0];

$prevTemp = isset($oldLocker['current_temp']) ? (float) $oldLocker['current_temp'] : null;
$prevTime = !empty($oldLocker['last_ping_at']) ? strtotime((string) $oldLocker['last_ping_at']) : null;
$elapsedSec = $prevTime ? max(1, time() - $prevTime) : null;

$currentTemp = isset($body['current_temp']) ? (float) $body['current_temp'] : (float) ($oldLocker['current_temp'] ?? 25.0);
$humidity = isset($body['humidity']) ? (float) $body['humidity'] : (float) ($oldLocker['humidity'] ?? 55.0);
$doorLocked = isset($body['door_locked']) ? (bool) $body['door_locked'] : (bool) ($oldLocker['door_locked'] ?? true);
$hasItem = isset($body['has_item']) ? (bool) $body['has_item'] : (bool) ($oldLocker['has_item'] ?? false);
$pwmPower = isset($body['pwm_power']) ? max(0, min(100, (int) $body['pwm_power'])) : (int) ($oldLocker['pwm_power'] ?? 0);
$wrongAttempts = isset($body['wrong_attempts']) ? max(0, (int) $body['wrong_attempts']) : (int) ($oldLocker['wrong_attempts'] ?? 0);
$online = isset($body['online']) ? (bool) $body['online'] : true;
$ackCmd = !empty($body['ack_cmd']);

$updateData = [
    'current_temp' => round($currentTemp, 1),
    'humidity' => round($humidity, 1),
    'door_locked' => $doorLocked,
    'has_item' => $hasItem,
    'pwm_power' => $pwmPower,
    'wrong_attempts' => $wrongAttempts,
    'online' => $online,
    'last_ping_at' => gmdate('c'),
    'updated_at' => gmdate('c'),
];

// Nếu mạch xác nhận đã nhận và thực thi pending_cmd -> xóa lệnh chờ
if ($ackCmd) {
    $updateData['pending_cmd'] = null;
}

$mergedForAi = array_merge($oldLocker, $updateData);
$aiResult = analyzeThermalHealth($mergedForAi, $prevTemp, $elapsedSec);

// Cập nhật vào bảng lockers
$saveRes = supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, $updateData, ['Prefer: return=representation']);
$updatedLocker = ($saveRes['ok'] && !empty($saveRes['data'])) ? $saveRes['data'][0] : $mergedForAi;

// Lưu lịch sử cảm biến vào telemetry_logs (phục vụ vẽ biểu đồ & huấn luyện AI)
supabaseRequest('POST', '/rest/v1/telemetry_logs', [
    'locker_id' => $lockerId,
    'current_temp' => $updateData['current_temp'],
    'target_temp' => (float) ($updatedLocker['target_temp'] ?? 25.0),
    'humidity' => $updateData['humidity'],
    'pwm_power' => $pwmPower,
    'door_locked' => $doorLocked,
    'has_item' => $hasItem,
    'efficiency_score' => $aiResult['efficiency_score'],
], ['Prefer: return=minimal']);

// Nếu phát hiện bất thường nhiệt học hoặc sai OTP >= 3 lần -> tự động ghi vào bảng alerts
if ($aiResult['has_anomaly'] || $wrongAttempts >= 3) {
    $alertMsg = $wrongAttempts >= 3
        ? 'Cảnh báo bảo mật: Nhập sai OTP ' . $wrongAttempts . ' lần tại Tủ ' . sprintf('%02d', $lockerId)
        : $aiResult['reason'];

    supabaseRequest('POST', '/rest/v1/alerts', [
        'locker_id' => $lockerId,
        'severity' => $wrongAttempts >= 3 ? 'CRITICAL' : $aiResult['severity'],
        'message' => $alertMsg,
        'resolved' => false,
    ], ['Prefer: return=minimal']);
}

jsonResponse([
    'ok' => true,
    'locker_id' => $lockerId,
    'pending_cmd' => $updatedLocker['pending_cmd'] ?? null,
    'target_temp' => (float) ($updatedLocker['target_temp'] ?? 25.0),
    'shipper_otp' => $updatedLocker['active_shipper_otp'] ?? null,
    'receiver_otp' => $updatedLocker['active_receiver_otp'] ?? null,
    'ai_analysis' => $aiResult,
]);
