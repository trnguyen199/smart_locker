<?php
require_once __DIR__ . '/bootstrap.php';

apiRequirePost();
$user = apiUser();
$otp = apiInput('otp');

if (!preg_match('/\A[0-9]{6}\z/', $otp)) {
    apiValidationError('Mã OTP phải gồm đúng 6 chữ số.');
}

if (!hitRateLimit('otp:' . $user['id'], 10, 900)) throw new ApiError('Đã thử quá nhiều mã. Vui lòng thử lại sau 15 phút.', 429, 'RATE_LIMITED');
$slot = atomic(function () use ($user, $otp) {
    $booking = queryOne("SELECT b.*, l.slot, l.online, l.status AS locker_status FROM bookings b JOIN lockers l ON l.id = b.locker_id WHERE b.company_id = ? AND b.otp_hash = ? AND b.status = 'ACTIVE' AND b.expires_at > datetime('now') AND (b.sender_id = ? OR b.recipient_email = ?)", [$user['company_id'], hash('sha256', $otp), $user['id'], $user['email']]);
    if (!$booking) throw new ApiError('Mã OTP không đúng, đã hết hạn hoặc không thuộc giao dịch của bạn.', 422, 'INVALID_OTP');
    if (!$booking['online'] || $booking['locker_status'] === 'ERROR') throw new ApiError('Ngăn tủ đang bảo trì. Vui lòng gửi yêu cầu hỗ trợ.', 409, 'LOCKER_UNAVAILABLE');
    executeSql("UPDATE bookings SET status = 'COLLECTED', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?", [$booking['id'], $user['company_id']]);
    executeSql("UPDATE lockers SET status = 'AVAILABLE' WHERE id = ? AND company_id = ?", [$booking['locker_id'], $user['company_id']]);
    return (int) $booking['slot'];
});
apiResponse(['status' => 'success', 'message' => 'Đã xác nhận nhận hàng trong chế độ mô phỏng.', 'slot' => $slot, 'simulation' => true]);
