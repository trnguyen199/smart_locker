<?php
/**
 * FILE: api/create_booking.php
 * Chức năng: Tạo giao dịch gửi hàng mới, chống xung đột 2 người đặt cùng 1 ngăn (Atomic Conditional PATCH),
 * sinh mã Smart Prefix OTP (đầu 1 lạnh, đầu 2 nóng, đầu 3 thường), lưu Supabase và gắn lệnh chờ gửi mạch ESP32.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('POST');

$user = requireAuthUser(false);
$body = getRequestJson();

$lockerId = (int) ($body['locker_id'] ?? 0);
$category = strtoupper(trim((string) ($body['category'] ?? 'PARCEL')));
$recipientEmail = trim((string) ($body['recipient_email'] ?? ''));
$targetTemp = isset($body['target_temp']) ? (float) $body['target_temp'] : 25.0;

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

// Kiểm tra thông tin tủ hiện tại
$checkRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerId . '&select=*');
if (!$checkRes['ok'] || empty($checkRes['data'])) {
    jsonError('Không tìm thấy ngăn tủ đã chọn.', 404);
}
$locker = $checkRes['data'][0];

if (($locker['type'] ?? 'NORMAL') === 'NORMAL' && $category !== 'PARCEL' && $targetTemp < 20.0) {
    $targetTemp = 25.0; // Ngăn thường không làm lạnh sâu
}

$shipperOtp = generateSmartPrefixOtp($category, $targetTemp);
$receiverOtp = generateReceiverOtp();

// [VẤN ĐÁP]: Chống Race Condition bằng Conditional Atomic PATCH (`status=eq.AVAILABLE&online=eq.true`).
// Nếu 2 người bấm đặt cùng 1 mili-giây, chỉ người đầu tiên cập nhật thành công; người thứ 2 nhận mảng rỗng -> báo HTTP 409 Conflict.
$lockRes = supabaseRequest(
    'PATCH',
    '/rest/v1/lockers?id=eq.' . $lockerId . '&status=eq.AVAILABLE&online=eq.true',
    [
        'status' => 'OCCUPIED',
        'target_temp' => $targetTemp,
        'active_category' => $category,
        'active_shipper_otp' => $shipperOtp,
        'active_receiver_otp' => $receiverOtp,
        'wrong_attempts' => 0,
        'pending_cmd' => 'CREATE_ORDER',
        'updated_at' => gmdate('c'),
    ],
    ['Prefer: return=representation']
);

if (!$lockRes['ok'] || empty($lockRes['data'])) {
    jsonError('Ngăn tủ vừa được người khác đặt hoặc đang mất kết nối. Vui lòng chọn ngăn trống khác.', 409);
}

$updatedLocker = $lockRes['data'][0];

// Tạo bản ghi giao dịch trong bảng bookings
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
    'status' => 'ACTIVE',
], ['Prefer: return=representation']);

if (!$bookingRes['ok'] || empty($bookingRes['data'])) {
    // Rollback trạng thái tủ nếu ghi booking lỗi
    supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'status' => 'AVAILABLE',
        'active_shipper_otp' => null,
        'active_receiver_otp' => null,
        'pending_cmd' => null,
    ]);
    jsonError('Không thể tạo bản ghi giao dịch trên Supabase.', 500, ['detail' => $bookingRes['data']]);
}

$booking = $bookingRes['data'][0];
logAuditEvent($user['email'], $user['is_company'] ? 'COMPANY_ADMIN' : 'USER', 'CREATE_BOOKING', $lockerId, [
    'booking_id' => $booking['id'],
    'category' => $category,
    'target_temp' => $targetTemp,
]);

jsonResponse([
    'ok' => true,
    'message' => 'Tạo đơn thành công! Mã OTP đã được gửi xuống Tủ ' . sprintf('%02d', $updatedLocker['slot']) . '.',
    'booking' => $booking,
    'locker' => $updatedLocker,
    'mqtt_command' => [
        'cmd' => 'CREATE_ORDER',
        'locker_id' => $lockerId,
        'slot' => (int) $updatedLocker['slot'],
        'category' => $category,
        'target_temp' => $targetTemp,
        'shipper_otp' => $shipperOtp,
        'receiver_otp' => $receiverOtp,
        'timestamp' => time(),
    ],
], 201);
