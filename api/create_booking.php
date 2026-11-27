<?php
/**
 * FILE: api/create_booking.php
 * Chức năng: Tạo giao dịch gửi hàng mới, chống xung đột 2 người đặt cùng 1 ngăn (Atomic Conditional PATCH),
 * sinh mã Smart Prefix OTP + thời hạn hết hạn `expires_at`, chuyển tủ sang `WAITING_DROP` (chờ bỏ hàng)
 * và trả về lệnh MQTT/Kiosk để bản mô phỏng của Lân và mạch của Duy cập nhật ngay.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('POST');

$user = requireAuthUser(false);
if (empty($user['has_locker_access'])) {
    jsonError('Tài khoản của bạn chưa được quản trị doanh nghiệp mời qua email nên chưa có quyền sử dụng tủ.', 403);
}
$body = getRequestJson();

$lockerId = (int) ($body['locker_id'] ?? 0);
$category = strtoupper(trim((string) ($body['category'] ?? 'PARCEL')));
$recipientEmail = trim((string) ($body['recipient_email'] ?? ''));
$targetTemp = isset($body['target_temp']) ? (float) $body['target_temp'] : 25.0;

// Hỗ trợ tùy chỉnh thời hạn OTP (mặc định 24 giờ; cho phép đặt theo phút để demo ca EXPIRED trước hội đồng)
$expiresInMinutes = isset($body['expires_in_minutes']) ? (int) $body['expires_in_minutes'] : 0;
$expiresInHours = isset($body['expires_in_hours']) ? (int) $body['expires_in_hours'] : 24;
if ($expiresInMinutes > 0) {
    $expiresInMinutes = max(1, min(10080, $expiresInMinutes));
    $expiresAtIso = gmdate('c', time() + ($expiresInMinutes * 60));
} else {
    $expiresInHours = max(1, min(168, $expiresInHours));
    $expiresAtIso = gmdate('c', time() + ($expiresInHours * 3600));
}

$allowedCategories = ['FOOD', 'DRINK', 'HOT_FOOD', 'PARCEL'];
if ($lockerId <= 0) {
    jsonError('Vui lòng chọn một ngăn tủ hợp lệ.', 422);
}
if (!in_array($category, $allowedCategories, true)) {
    jsonError('Loại hàng hóa không hợp lệ.', 422);
}
if (!filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
    jsonError('Email người nhận không đúng định dạng.', 422);
}
if ($targetTemp < 2.0 || $targetTemp > 65.0) {
    jsonError('Nhiệt độ mục tiêu phải nằm trong khoảng 2°C đến 65°C.', 422);
}

$checkRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerId . '&select=*');
if (!$checkRes['ok'] || empty($checkRes['data'])) {
    jsonError('Không tìm thấy ngăn tủ đã chọn.', 404);
}
$locker = $checkRes['data'][0];

$shipperOtp = generateSmartPrefixOtp($category, $targetTemp);
$receiverOtp = generateReceiverOtp();

// [VẤN ĐÁP]: Chống Race Condition bằng Conditional Atomic PATCH (`status=eq.AVAILABLE&online=eq.true`).
// Nếu 2 người đặt trùng 1 ngăn cùng mili-giây, chỉ người đầu tiên giữ được ngăn; người thứ 2 nhận HTTP 409 Conflict.
$lockRes = supabaseRequest(
    'PATCH',
    '/rest/v1/lockers?id=eq.' . $lockerId . '&status=eq.AVAILABLE&online=eq.true',
    [
        'status' => 'WAITING_DROP',
        'target_temp' => $targetTemp,
        'active_category' => $category,
        'active_shipper_otp' => $shipperOtp,
        'active_receiver_otp' => $receiverOtp,
        'wrong_attempts' => 0,
        'lockout_until' => null,
        'pending_cmd' => 'CREATE_ORDER',
        'updated_at' => gmdate('c'),
    ],
    ['Prefer: return=representation']
);

if (!$lockRes['ok'] || empty($lockRes['data'])) {
    jsonError('Ngăn tủ vừa được người khác đặt hoặc đang mất kết nối. Vui lòng chọn ngăn trống khác.', 409);
}

$updatedLocker = $lockRes['data'][0];

$bookingRes = supabaseRequest('POST', '/rest/v1/bookings', [
    'locker_id' => $lockerId,
    'slot' => (int) ($updatedLocker['slot'] ?? $lockerId),
    'category' => $category,
    'target_temp' => $targetTemp,
    'sender_id' => $user['id'],
    'sender_email' => $user['email'],
    'sender_name' => $user['full_name'],
    'recipient_email' => $recipientEmail,
    'shipper_otp' => $shipperOtp,
    'receiver_otp' => $receiverOtp,
    'expires_at' => $expiresAtIso,
    'status' => 'ACTIVE',
], ['Prefer: return=representation']);

if (!$bookingRes['ok'] || empty($bookingRes['data'])) {
    supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'status' => 'AVAILABLE',
        'active_shipper_otp' => null,
        'active_receiver_otp' => null,
        'pending_cmd' => null,
    ]);
    jsonError('Không thể tạo bản ghi giao dịch trên Supabase.', 500, ['detail' => $bookingRes['data']]);
}

$booking = $bookingRes['data'][0];
logAuditEvent($user['email'], $user['role'], 'CREATE_BOOKING', $lockerId, [
    'booking_id' => $booking['id'],
    'category' => $category,
    'target_temp' => $targetTemp,
    'expires_at' => $expiresAtIso,
    'sender_email' => $user['email'],
    'recipient_email' => $recipientEmail,
]);

jsonResponse([
    'ok' => true,
    'message' => 'Tạo đơn thành công! Tủ ' . sprintf('%02d', $updatedLocker['slot']) . ' đang chờ bỏ hàng (Smart OTP đã gửi xuống tủ).',
    // Chỉ trả OTP cho người vừa tạo đơn qua kết nối HTTPS; không đưa vào API danh sách/MQTT.
    'booking' => [
        'id' => (int) $booking['id'],
        'locker_id' => $lockerId,
        'slot' => (int) $updatedLocker['slot'],
        'category' => $category,
        'target_temp' => $targetTemp,
        'recipient_email' => $recipientEmail,
        'shipper_otp' => $shipperOtp,
        'receiver_otp' => $receiverOtp,
        'expires_at' => $expiresAtIso,
        'status' => 'ACTIVE',
    ],
    'locker' => $updatedLocker,
    'mqtt_command' => [
        'cmd' => 'CREATE_ORDER',
        'locker_id' => $lockerId,
        'slot' => (int) $updatedLocker['slot'],
        'category' => $category,
        'target_temp' => $targetTemp,
        'expires_at' => $expiresAtIso,
        'timestamp' => time(),
    ],
], 201);
