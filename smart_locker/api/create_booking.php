<?php
require_once __DIR__ . '/bootstrap.php';

apiRequirePost();
$user = apiUser();
$lockerId = apiLockerId();
$category = apiInput('category');
$targetTemp = filter_var(apiInput('target_temp'), FILTER_VALIDATE_FLOAT);

if (!in_array($category, ['FOOD', 'DRINK', 'PARCEL'], true)) {
    apiValidationError('Loại hàng phải là FOOD, DRINK hoặc PARCEL.');
}
if ($targetTemp === false || !is_finite($targetTemp) || $targetTemp < 2 || $targetTemp > 25) {
    apiValidationError('Nhiệt độ bảo quản phải nằm trong khoảng 2–25°C.');
}

$recipient = mb_strtolower(apiText('recipient_email', 254, false)) ?: $user['email'];
if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) throw new ApiError('Email người nhận không hợp lệ.');
$result = atomic(function () use ($user, $lockerId, $category, $targetTemp, $recipient) {
    $locker = queryOne('SELECT * FROM lockers WHERE id = ? AND company_id = ?', [$lockerId, $user['company_id']]);
    if (!$locker) throw new ApiError('Không tìm thấy ngăn tủ trong công ty.', 404, 'NOT_FOUND');
    if ($locker['status'] !== 'AVAILABLE' || !$locker['online']) throw new ApiError('Tủ vừa được sử dụng hoặc đang bảo trì. Hãy chọn tủ khác.', 409, 'LOCKER_UNAVAILABLE');
    if (!queryOne('SELECT id FROM users WHERE company_id = ? AND email = ?', [$user['company_id'], $recipient])) throw new ApiError('Người nhận cần có tài khoản trong cùng công ty.');
    $temperature = $locker['type'] === 'NORMAL' || $category === 'PARCEL' ? 25.0 : $targetTemp;
    do {
        $otp = sprintf('%06d', random_int(0, 999999));
        $otpHash = hash('sha256', $otp);
    } while (queryOne("SELECT id FROM bookings WHERE company_id = ? AND otp_hash = ? AND status = 'ACTIVE'", [$user['company_id'], $otpHash]));
    executeSql("INSERT INTO bookings (company_id, locker_id, sender_id, recipient_email, category, target_temp, otp_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+24 hours'))", [$user['company_id'], $lockerId, $user['id'], $recipient, $category, $temperature, $otpHash]);
    $id = (int) db()->lastInsertId();
    executeSql("UPDATE lockers SET status = 'OCCUPIED', target_temp = ? WHERE id = ? AND company_id = ?", [$temperature, $lockerId, $user['company_id']]);
    return ['id' => $id, 'otp' => $otp, 'slot' => (int) $locker['slot']];
});
apiResponse(array_merge(['status' => 'success', 'message' => 'Đã tạo giao dịch mô phỏng. Hãy lưu mã OTP và gửi riêng cho người nhận.', 'simulation' => true], $result), 201);
