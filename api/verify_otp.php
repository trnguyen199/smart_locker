<?php
/**
 * FILE: api/verify_otp.php
 * Chức năng: Xác thực mã OTP 6 chữ số (từ Web lockers.php?mode=receive, bản mô phỏng của Lân, hoặc Keypad ESP32).
 * Đầy đủ nghiệp vụ BA:
 *  - Kiểm tra khóa an ninh Anti-Brute-Force (`lockout_until` / sai >= 3 lần trong 60s -> HTTP 423 Locked).
 *  - Kiểm tra hạn sử dụng OTP (`expires_at` -> nếu quá hạn trả HTTP 410 Gone và đánh dấu EXPIRED).
 *  - Chặn tái sử dụng `shipper_otp` (mã 1 lần -> nếu đã dùng trả HTTP 409 Conflict).
 *  - Đồng bộ trạng thái tủ (`WAITING_DROP` -> `OPEN` -> `OCCUPIED` / `AVAILABLE`).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('POST');

$isDeviceCall = isset($_SERVER['HTTP_X_DEVICE_KEY']);
$actorEmail = 'kiosk-keypad@smartlocker.local';
$actorRole = 'IOT_KIOSK';

if ($isDeviceCall) {
    requireIoTDeviceKey();
} else {
    $user = requireAuthUser(false);
    if (empty($user['has_locker_access'])) {
        jsonError('Tài khoản của bạn chưa được quản trị doanh nghiệp mời qua email nên chưa có quyền xác thực OTP / mở tủ.', 403);
    }
    $actorEmail = $user['email'];
    $actorRole = $user['role'];
}

$body = getRequestJson();
$otp = preg_replace('/\D/', '', (string) ($body['otp'] ?? ''));
$lockerIdHint = (int) ($body['locker_id'] ?? 0);

if (strlen($otp) !== 6) {
    jsonError('Mã OTP phải gồm đúng 6 chữ số.', 422);
}

// 1. Tự động quét các đơn đã quá hạn trước khi kiểm tra OTP
sweepExpiredBookings();

// 2. [VẤN ĐÁP]: Kiểm tra khóa an ninh Anti-Brute-Force TRƯỚC khi đối chiếu OTP
if ($lockerIdHint > 0) {
    $lCheck = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerIdHint . '&select=id,status,wrong_attempts,lockout_until');
    if ($lCheck['ok'] && !empty($lCheck['data'])) {
        $lk = $lCheck['data'][0];
        $lockUntilTs = !empty($lk['lockout_until']) ? strtotime((string) $lk['lockout_until']) : null;
        if (($lk['status'] ?? '') === 'LOCKOUT' && $lockUntilTs !== null && $lockUntilTs > time()) {
            $remain = max(1, $lockUntilTs - time());
            jsonError(
                'Tủ ' . sprintf('%02d', $lockerIdHint) . ' đang bị khóa an ninh do nhập sai OTP quá 3 lần. Vui lòng thử lại sau ' . $remain . ' giây.',
                423,
                ['code' => 'LOCKER_LOCKED', 'retry_after_sec' => $remain]
            );
        }
    }
} elseif (!$isDeviceCall) {
    // Nếu bấm nhận hàng trên Web không chọn số tủ -> giới hạn 3 lần sai / 60 giây theo tài khoản
    $sinceIso = gmdate('c', time() - 60);
    $failRes = supabaseRequest(
        'GET',
        '/rest/v1/audit_logs?action=eq.OTP_FAILED&actor_email=eq.' . rawurlencode($actorEmail)
        . '&created_at=gte.' . rawurlencode($sinceIso) . '&select=id'
    );
    if ($failRes['ok'] && is_array($failRes['data']) && count($failRes['data']) >= 3) {
        jsonError('Bạn đã nhập sai OTP 3 lần trong 1 phút. Vui lòng chờ 60 giây rồi thử lại.', 423, [
            'code' => 'USER_OTP_RATE_LIMITED',
            'retry_after_sec' => 60,
        ]);
    }
}

// 3. Tra cứu đơn hàng khớp mã OTP (bao gồm cả ACTIVE và EXPIRED để báo lỗi đúng nghiệp vụ BA)
$query = '/rest/v1/bookings?select=id,locker_id,slot,category,target_temp,sender_email,recipient_email,shipper_otp,receiver_otp,shipper_otp_used_at,receiver_otp_used_at,expires_at,status'
    . '&or=(receiver_otp.eq.' . rawurlencode($otp) . ',shipper_otp.eq.' . rawurlencode($otp) . ')&order=created_at.desc&limit=1';
if ($lockerIdHint > 0) {
    $query .= '&locker_id=eq.' . $lockerIdHint;
}
$bookingRes = supabaseRequest('GET', $query);
if (!$bookingRes['ok']) {
    jsonError('Lỗi truy vấn Supabase khi xác thực OTP.', 502);
}

$matches = is_array($bookingRes['data']) ? $bookingRes['data'] : [];

if (empty($matches) || !in_array($matches[0]['status'] ?? '', ['ACTIVE', 'EXPIRED'], true)) {
    // Ghi log sai OTP & xử lý khóa tủ nếu sai >= 3 lần
    logAuditEvent($actorEmail, $actorRole, 'OTP_FAILED', $lockerIdHint > 0 ? $lockerIdHint : null, ['otp_len' => strlen($otp)]);

    if ($lockerIdHint > 0) {
        $lRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerIdHint . '&select=id,wrong_attempts');
        if ($lRes['ok'] && !empty($lRes['data'])) {
            $attempts = ((int) ($lRes['data'][0]['wrong_attempts'] ?? 0)) + 1;
            $patch = ['wrong_attempts' => $attempts, 'updated_at' => gmdate('c')];
            if ($attempts >= 3) {
                $patch['status'] = 'LOCKOUT';
                $patch['lockout_until'] = gmdate('c', time() + 60);
                supabaseRequest('POST', '/rest/v1/alerts', [
                    'locker_id' => $lockerIdHint,
                    'severity' => 'CRITICAL',
                    'message' => 'Khóa an ninh (Anti-Brute-Force): Nhập sai OTP ' . $attempts . ' lần tại Tủ ' . sprintf('%02d', $lockerIdHint) . ' (Khóa 60 giây).',
                    'resolved' => false,
                ], ['Prefer: return=minimal']);
            }
            supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerIdHint, $patch);
            if ($attempts >= 3) {
                jsonError('Nhập sai OTP 3 lần liên tiếp! Tủ ' . sprintf('%02d', $lockerIdHint) . ' đã bị khóa an ninh trong 60 giây.', 423, [
                    'code' => 'LOCKER_LOCKED',
                    'retry_after_sec' => 60,
                ]);
            }
            jsonError('Mã OTP không đúng (sai lần ' . $attempts . '/3 tại Tủ ' . sprintf('%02d', $lockerIdHint) . ').', 401);
        }
    }

    jsonError('Mã OTP không đúng hoặc giao dịch đã hoàn tất/bị hủy.', 401);
}

$booking = $matches[0];
$lockerId = (int) $booking['locker_id'];
$expiresTs = !empty($booking['expires_at']) ? strtotime((string) $booking['expires_at']) : null;

// Kiểm tra đơn hàng quá hạn OTP
if (($booking['status'] ?? '') === 'EXPIRED' || ($expiresTs !== null && $expiresTs < time())) {
    if (($booking['status'] ?? '') !== 'EXPIRED') {
        supabaseRequest('PATCH', '/rest/v1/bookings?id=eq.' . (int) $booking['id'], ['status' => 'EXPIRED']);
    }
    jsonError('Mã OTP đã hết hạn sử dụng. Vui lòng liên hệ Quản trị viên tòa nhà để hỗ trợ mở tủ lấy hàng.', 410, [
        'code' => 'OTP_EXPIRED',
        'booking_id' => $booking['id'],
        'slot' => $booking['slot'],
    ]);
}

$isShipperDrop = ($booking['shipper_otp'] ?? '') === $otp;

// 4A. LUỒNG SHIPPER NHẬP OTP ĐỂ BỎ HÀNG VÀO TỦ
if ($isShipperDrop) {
    if (!empty($booking['shipper_otp_used_at'])) {
        jsonError('Mã OTP Shipper này đã được sử dụng trước đó. Không thể mở lại cửa bằng mã gửi hàng.', 409, [
            'code' => 'SHIPPER_OTP_ALREADY_USED',
        ]);
    }

    $consumeRes = supabaseRequest('PATCH', '/rest/v1/bookings?id=eq.' . (int) $booking['id']
        . '&status=eq.ACTIVE&shipper_otp_used_at=is.null', [
        'shipper_otp_used_at' => gmdate('c'),
    ], ['Prefer: return=representation']);
    if (!$consumeRes['ok']) {
        jsonError('Không thể cập nhật trạng thái OTP Shipper.', 502);
    }
    if (empty($consumeRes['data'])) {
        jsonError('Mã OTP Shipper vừa được sử dụng ở một yêu cầu khác.', 409, [
            'code' => 'SHIPPER_OTP_ALREADY_USED',
        ]);
    }

    // OTP chỉ phát lệnh mở; trạng thái OCCUPIED được xác nhận sau sự kiện DOOR_CLOSED.
    supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'status' => 'OPEN',
        'door_locked' => false,
        'wrong_attempts' => 0,
        'lockout_until' => null,
        'pending_cmd' => 'UNLOCK_DROP',
        'updated_at' => gmdate('c'),
    ]);

    logAuditEvent($actorEmail, $actorRole, 'VERIFY_SHIPPER_OTP', $lockerId, [
        'booking_id' => $booking['id'],
        'sender_email' => $booking['sender_email'] ?? null,
        'recipient_email' => $booking['recipient_email'] ?? null,
    ]);

    jsonResponse([
        'ok' => true,
        'mode' => 'SHIPPER_DROP',
        'message' => 'Xác thực Shipper thành công! Đã mở chốt Tủ ' . sprintf('%02d', $booking['slot']) . ' để bỏ hàng và kích hoạt giữ nhiệt ' . $booking['target_temp'] . '°C.',
        'booking' => [
            'id' => (int) $booking['id'],
            'locker_id' => $lockerId,
            'slot' => (int) $booking['slot'],
            'category' => (string) $booking['category'],
            'target_temp' => (float) $booking['target_temp'],
            'expires_at' => $booking['expires_at'],
            'status' => (string) $booking['status'],
        ],
        'mqtt_command' => [
            'cmd' => 'REMOTE_UNLOCK',
            'locker_id' => $lockerId,
            'slot' => (int) $booking['slot'],
            'reason' => 'SHIPPER_DROP',
            'timestamp' => time(),
        ],
    ]);
}

// 4B. LUỒNG NGƯỜI NHẬN NHẬP RECEIVER OTP ĐỂ LẤY HÀNG
$collectRes = supabaseRequest('PATCH', '/rest/v1/bookings?id=eq.' . (int) $booking['id']
    . '&status=eq.ACTIVE&receiver_otp_used_at=is.null', [
    'status' => 'COLLECTED',
    'receiver_otp_used_at' => gmdate('c'),
    'collected_at' => gmdate('c'),
], ['Prefer: return=representation']);
if (!$collectRes['ok']) {
    jsonError('Không thể cập nhật trạng thái OTP người nhận.', 502);
}
if (empty($collectRes['data'])) {
    jsonError('Mã OTP nhận hàng vừa được sử dụng ở một yêu cầu khác.', 409, [
        'code' => 'RECEIVER_OTP_ALREADY_USED',
    ]);
}

// Chuyển OPEN và chờ cảm biến xác nhận DOOR_CLOSED/has_item trước khi trả tủ về AVAILABLE.
$lockerUpdate = [
    'status' => 'OPEN',
    'door_locked' => false,
    'active_category' => null,
    'active_shipper_otp' => null,
    'active_receiver_otp' => null,
    'wrong_attempts' => 0,
    'lockout_until' => null,
    'pending_cmd' => 'UNLOCK_PICKUP',
    'updated_at' => gmdate('c'),
];
supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, $lockerUpdate);

logAuditEvent($actorEmail, $actorRole, 'VERIFY_RECEIVER_OTP', $lockerId, [
    'booking_id' => $booking['id'],
    'sender_email' => $booking['sender_email'] ?? null,
    'recipient_email' => $booking['recipient_email'] ?? null,
]);

jsonResponse([
    'ok' => true,
    'mode' => 'RECEIVER_PICKUP',
    'message' => 'Xác thực OTP thành công! Tủ ' . sprintf('%02d', $booking['slot']) . ' đã mở khóa, mời bạn nhận kiện hàng.',
        'booking' => [
            'id' => (int) $booking['id'],
            'locker_id' => $lockerId,
            'slot' => (int) $booking['slot'],
            'category' => (string) $booking['category'],
            'target_temp' => (float) $booking['target_temp'],
            'expires_at' => $booking['expires_at'],
            'status' => 'COLLECTED',
        ],
    'mqtt_command' => [
        'cmd' => 'REMOTE_UNLOCK',
        'locker_id' => $lockerId,
        'slot' => (int) $booking['slot'],
        'reason' => 'RECEIVER_PICKUP',
        'timestamp' => time(),
    ],
]);
