<?php
/**
 * FILE: api/verify_otp.php
 * Chức năng: Xác thực mã OTP 6 chữ số (từ trang Nhận hàng hoặc từ bàn phím Keypad 4x4 trên Wokwi).
 * Tích hợp cơ chế chống dò mã Anti-Brute-Force (sai quá 3 lần -> khóa cảnh báo & ghi log).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('POST');

$isDeviceCall = isset($_SERVER['HTTP_X_DEVICE_KEY']);
$actorEmail = 'esp32-keypad@smartlocker.local';
$actorRole = 'IOT_DEVICE';

if ($isDeviceCall) {
    requireIoTDeviceKey();
} else {
    $user = requireAuthUser(false);
    $actorEmail = $user['email'];
    $actorRole = $user['is_company'] ? 'COMPANY_ADMIN' : 'USER';
}

$body = getRequestJson();
$otp = preg_replace('/\D/', '', (string) ($body['otp'] ?? ''));
$lockerIdHint = (int) ($body['locker_id'] ?? 0);

if (strlen($otp) !== 6) {
    jsonError('Mã OTP phải gồm đúng 6 chữ số.', 422);
}

// Tìm giao dịch đang ACTIVE khớp với receiver_otp hoặc shipper_otp
$query = '/rest/v1/bookings?status=eq.ACTIVE&or=(receiver_otp.eq.' . rawurlencode($otp) . ',shipper_otp.eq.' . rawurlencode($otp) . ')&order=created_at.desc&limit=1';
$bookingRes = supabaseRequest('GET', $query);

if (!$bookingRes['ok']) {
    jsonError('Lỗi truy vấn Supabase khi xác thực OTP.', 502);
}

$matches = is_array($bookingRes['data']) ? $bookingRes['data'] : [];

if (empty($matches)) {
    // [VẤN ĐÁP]: Cơ chế Anti-Brute-Force - Tăng bộ đếm sai và phát cảnh báo an ninh nếu nhập sai >= 3 lần.
    if ($lockerIdHint > 0) {
        $lRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerIdHint . '&select=id,wrong_attempts');
        if ($lRes['ok'] && !empty($lRes['data'])) {
            $attempts = ((int) ($lRes['data'][0]['wrong_attempts'] ?? 0)) + 1;
            supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerIdHint, [
                'wrong_attempts' => $attempts,
                'updated_at' => gmdate('c'),
            ]);
            if ($attempts >= 3) {
                supabaseRequest('POST', '/rest/v1/alerts', [
                    'locker_id' => $lockerIdHint,
                    'severity' => 'CRITICAL',
                    'message' => 'Cảnh báo dò mã OTP (Anti-Brute-Force): Sai ' . $attempts . ' lần tại Tủ ' . sprintf('%02d', $lockerIdHint),
                    'resolved' => false,
                ], ['Prefer: return=minimal']);
            }
        }
    }
    jsonError('Mã OTP không đúng hoặc giao dịch đã hoàn tất/bị hủy.', 401);
}

$booking = $matches[0];
$lockerId = (int) $booking['locker_id'];
$isShipperDrop = ($booking['shipper_otp'] ?? '') === $otp;

if ($isShipperDrop) {
    // Shipper mở tủ để bỏ hàng vào -> Tủ vẫn OCCUPIED và duy trì nhiệt độ mục tiêu
    supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'door_locked' => false,
        'wrong_attempts' => 0,
        'pending_cmd' => 'UNLOCK_DROP',
        'updated_at' => gmdate('c'),
    ]);

    logAuditEvent($actorEmail, $actorRole, 'VERIFY_SHIPPER_OTP', $lockerId, ['booking_id' => $booking['id']]);

    jsonResponse([
        'ok' => true,
        'mode' => 'SHIPPER_DROP',
        'message' => 'Xác thực Shipper thành công! Đã mở chốt Tủ ' . sprintf('%02d', $booking['slot']) . ' để bỏ hàng.',
        'booking' => $booking,
        'mqtt_command' => [
            'cmd' => 'REMOTE_UNLOCK',
            'locker_id' => $lockerId,
            'slot' => (int) $booking['slot'],
            'reason' => 'SHIPPER_DROP',
            'timestamp' => time(),
        ],
    ]);
}

// Người nhận nhập Receiver OTP -> Đánh dấu COLLECTED, mở cửa và trả tủ về AVAILABLE
supabaseRequest('PATCH', '/rest/v1/bookings?id=eq.' . (int) $booking['id'], [
    'status' => 'COLLECTED',
    'collected_at' => gmdate('c'),
]);

supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
    'status' => 'AVAILABLE',
    'door_locked' => false,
    'has_item' => false,
    'active_category' => null,
    'active_shipper_otp' => null,
    'active_receiver_otp' => null,
    'wrong_attempts' => 0,
    'pending_cmd' => 'UNLOCK_PICKUP',
    'updated_at' => gmdate('c'),
]);

logAuditEvent($actorEmail, $actorRole, 'VERIFY_RECEIVER_OTP', $lockerId, ['booking_id' => $booking['id']]);

jsonResponse([
    'ok' => true,
    'mode' => 'RECEIVER_PICKUP',
    'message' => 'Xác thực OTP thành công! Tủ ' . sprintf('%02d', $booking['slot']) . ' đã mở khóa, mời bạn nhận kiện hàng.',
    'booking' => array_merge($booking, ['status' => 'COLLECTED']),
    'mqtt_command' => [
        'cmd' => 'REMOTE_UNLOCK',
        'locker_id' => $lockerId,
        'slot' => (int) $booking['slot'],
        'reason' => 'RECEIVER_PICKUP',
        'timestamp' => time(),
    ],
]);
