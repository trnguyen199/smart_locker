<?php
/**
 * FILE: api/bootstrap.php
 * Phụ trách: Ngọc Hiếu
 * Chức năng: Khởi tạo API JSON, hỗ trợ CORS cho web mô phỏng local (Phạm Vũ Lân),
 * giao tiếp Supabase PostgREST chuẩn khóa mới (sb_secret_ / sb_publishable_),
 * xác thực JWT + phân quyền 3 vai trò (ADMIN / SHIPPER / RECEIVER),
 * quét tự động đơn hàng quá hạn (EXPIRED) và bộ phân tích bất thường nhiệt học (Thermal AI).
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/env.php';

// Chỉ phản chiếu Origin đã được cho phép. Không dùng wildcard trong production.
$appEnv = strtolower(slEnv('APP_ENV', 'development'));
$requestOrigin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
$allowedOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', slEnv('CORS_ALLOWED_ORIGIN', 'http://127.0.0.1:8000'))
)));
$originAllowed = $requestOrigin === '';
if ($requestOrigin !== '') {
    if (in_array($requestOrigin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $requestOrigin);
        header('Vary: Origin');
        $originAllowed = true;
    } elseif ($appEnv !== 'production' && in_array('*', $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: *');
        $originAllowed = true;
    }
}
header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Device-Key, Accept');
header('Access-Control-Max-Age: 3600');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Xử lý Preflight OPTIONS ngay lập tức
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    if (!$originAllowed) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Origin không được phép gọi API.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    http_response_code(204);
    exit;
}

function jsonResponse(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jsonError(string $message, int $statusCode = 400, array $extra = []): void
{
    if (strtolower(slEnv('APP_ENV', 'development')) === 'production') {
        unset($extra['detail']);
    }
    jsonResponse(array_merge([
        'ok' => false,
        'error' => $message,
    ], $extra), $statusCode);
}

function getRequestJson(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return $_POST ?: [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        jsonError('Payload JSON không hợp lệ.', 400);
    }
    return $decoded;
}

function requireMethod(string ...$allowed): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, $allowed, true)) {
        jsonError('Phương thức HTTP không được hỗ trợ.', 405);
    }
}

function getBearerToken(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        foreach ($headers as $k => $v) {
            if (strtolower((string) $k) === 'authorization') {
                $header = (string) $v;
                break;
            }
        }
    }
    if (preg_match('/Bearer\s+(.+)/i', $header, $matches)) {
        return trim($matches[1]);
    }
    return null;
}

function getSupabaseConfig(): array
{
    $url = rtrim(slEnv('SUPABASE_URL', 'https://rtnvspgxhoouowwrpolz.supabase.co'), '/');
    $secretKey = slEnv('SUPABASE_SECRET_KEY', slEnv('SUPABASE_SERVICE_ROLE_KEY', ''));
    $publishableKey = slEnv('SUPABASE_PUBLISHABLE_KEY', slEnv('SUPABASE_ANON_KEY', 'sb_publishable_c5oBHtyAsCxM1u7khnse8Q_WerTw-OJ'));

    if ($url === '' || strpos($url, 'YOUR_PROJECT') !== false) {
        jsonError('Thiếu cấu hình SUPABASE_URL trong file .env.', 500);
    }
    if ($secretKey === '' || strpos($secretKey, 'YOUR_') !== false) {
        jsonError('Chưa cấu hình SUPABASE_SECRET_KEY trong file .env. Vui lòng copy .env.example thành .env và điền khóa sb_secret_...', 503, [
            'code' => 'MISSING_SERVICE_KEY',
        ]);
    }

    return [
        'url' => $url,
        'secret_key' => $secretKey,
        'publishable_key' => $publishableKey,
    ];
}

// [VẤN ĐÁP]: Hàm gọi Supabase PostgREST API bằng cURL thuần của PHP.
// Khóa mới `sb_secret_...` KHÔNG phải JWT nên chỉ truyền qua header `apikey` (không truyền Authorization: Bearer).
function supabaseRequest(
    string $method,
    string $endpoint,
    ?array $body = null,
    array $extraHeaders = [],
    ?string $bearerToken = null
): array {
    if (!function_exists('curl_init')) {
        jsonError('PHP chưa bật extension cURL (extension=curl trong php.ini).', 500);
    }

    $cfg = getSupabaseConfig();
    $url = $cfg['url'] . $endpoint;

    $headers = [
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    if ($bearerToken !== null) {
        $headers[] = 'apikey: ' . $cfg['publishable_key'];
        $headers[] = 'Authorization: Bearer ' . $bearerToken;
    } else {
        $headers[] = 'apikey: ' . $cfg['secret_key'];
        if (strpos($cfg['secret_key'], 'sb_secret_') !== 0) {
            $headers[] = 'Authorization: Bearer ' . $cfg['secret_key'];
        }
    }
    foreach ($extraHeaders as $h) {
        $headers[] = $h;
    }

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);

    $caBundle = trim(slEnv('SUPABASE_CA_BUNDLE', ''));
    if ($caBundle !== '') {
        if (!is_file($caBundle) || !is_readable($caBundle)) {
            jsonError('SUPABASE_CA_BUNDLE không tồn tại hoặc PHP không có quyền đọc.', 500, [
                'code' => 'INVALID_CA_BUNDLE',
            ]);
        }
        curl_setopt($ch, CURLOPT_CAINFO, $caBundle);
    }

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    $rawResponse = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($rawResponse === false) {
        jsonError('Không kết nối được máy chủ Supabase: ' . $curlErr, 502);
    }

    $decoded = json_decode($rawResponse, true);
    return [
        'status' => $httpCode,
        'ok' => $httpCode >= 200 && $httpCode < 300,
        'data' => $decoded !== null ? $decoded : $rawResponse,
    ];
}

// [VẤN ĐÁP]: Xác thực JWT trực tiếp với Supabase Auth (/auth/v1/user) và kết hợp bảng company_members
// để phân quyền 3 vai trò thật ở Backend: ADMIN (Quản trị), SHIPPER (Người giao), RECEIVER (Người nhận/Nhân viên).
function requireAuthUser(bool $requireCompany = false, array $allowedRoles = []): array
{
    $token = getBearerToken();
    if (!$token) {
        jsonError('Thiếu phiên đăng nhập (Bearer Token). Vui lòng đăng nhập lại.', 401);
    }

    $res = supabaseRequest('GET', '/auth/v1/user', null, [], $token);
    if (!$res['ok'] || !is_array($res['data']) || empty($res['data']['id'])) {
        jsonError('Phiên đăng nhập hết hạn hoặc không hợp lệ.', 401);
    }

    $user = $res['data'];
    $meta = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];
    $email = strtolower(trim((string) ($user['email'] ?? '')));
    // user_metadata do trình duyệt gửi lúc đăng ký nên tuyệt đối không dùng để cấp ADMIN.
    $role = 'RECEIVER';
    $accountType = 'user';
    $companyName = '';
    $bootstrapAdmins = array_values(array_filter(array_map(
        static fn(string $value): string => strtolower(trim($value)),
        explode(',', slEnv('ADMIN_EMAILS', ''))
    )));

    if ($email !== '' && in_array($email, $bootstrapAdmins, true)) {
        $role = 'ADMIN';
        $accountType = 'company';
        $companyName = trim((string) ($meta['company_name'] ?? ''));
    }

    // Quyền vận hành chỉ được đọc từ bảng do backend quản lý.
    if ($email !== '' && $role !== 'ADMIN') {
        $mRes = supabaseRequest(
            'GET',
            '/rest/v1/company_members?member_email=ilike.' . rawurlencode($email) . '&select=role,company_name,status&limit=1'
        );
        if ($mRes['ok'] && is_array($mRes['data']) && !empty($mRes['data'])) {
            $memberRole = strtoupper((string) ($mRes['data'][0]['role'] ?? 'STAFF'));
            if ($memberRole === 'ADMIN') {
                $role = 'ADMIN';
            } elseif ($memberRole === 'SHIPPER') {
                $role = 'SHIPPER';
            }
            $accountType = 'company';
            $companyName = trim((string) ($mRes['data'][0]['company_name'] ?? ''));
        }
    }

    $normalized = [
        'id' => (string) $user['id'],
        'email' => $email,
        'full_name' => trim((string) ($meta['full_name'] ?? $meta['name'] ?? explode('@', $email ?: 'user')[0])),
        'company_name' => $companyName,
        'account_type' => $accountType,
        'role' => $role,
        'is_company' => ($role === 'ADMIN'),
        'access_token' => $token,
    ];

    if ($requireCompany && !$normalized['is_company']) {
        jsonError('Chức năng này chỉ dành cho tài khoản Quản trị Doanh nghiệp (ADMIN).', 403);
    }

    if (!empty($allowedRoles) && !in_array($normalized['role'], $allowedRoles, true)) {
        jsonError('Vai trò [' . $normalized['role'] . '] không có quyền thực hiện thao tác này.', 403);
    }

    return $normalized;
}

// [VẤN ĐÁP]: Xác thực tủ mô phỏng (Phạm Vũ Lân) & mạch ESP32/Wokwi (Duy Quách) bằng header X-Device-Key.
function requireIoTDeviceKey(): void
{
    $expected = trim(slEnv('IOT_DEVICE_KEY', ''));
    if ($expected === '' || (strlen($expected) < 32 && strtolower(slEnv('APP_ENV', 'development')) === 'production')) {
        jsonError('Máy chủ chưa cấu hình khóa thiết bị IoT an toàn.', 503, [
            'code' => 'MISSING_DEVICE_KEY',
        ]);
    }
    // Chỉ nhận qua header để khóa không xuất hiện trong URL, access log hoặc browser history.
    $provided = $_SERVER['HTTP_X_DEVICE_KEY'] ?? '';
    if ($provided === '' || !hash_equals($expected, (string) $provided)) {
        jsonError('Thiết bị IoT / Mô phỏng chưa được cấp quyền (Sai X-Device-Key).', 403);
    }
}

// [VẤN ĐÁP]: Tự động quét các đơn hàng ACTIVE đã quá thời hạn `expires_at` -> đánh dấu EXPIRED
// và phát cảnh báo cho Quản trị viên xử lý (không tự ý mở cửa tủ để đảm bảo an toàn hàng hóa).
function sweepExpiredBookings(): int
{
    $nowIso = gmdate('c');
    $res = supabaseRequest(
        'GET',
        '/rest/v1/bookings?status=eq.ACTIVE&expires_at=lt.' . rawurlencode($nowIso) . '&select=id,locker_id,slot,recipient_email&limit=20'
    );
    if (!$res['ok'] || !is_array($res['data']) || empty($res['data'])) {
        return 0;
    }

    $expiredCount = 0;
    foreach ($res['data'] as $b) {
        $bid = (int) ($b['id'] ?? 0);
        $lid = (int) ($b['locker_id'] ?? 0);
        $slot = (int) ($b['slot'] ?? $lid);
        if ($bid <= 0) {
            continue;
        }
        $upd = supabaseRequest('PATCH', '/rest/v1/bookings?id=eq.' . $bid . '&status=eq.ACTIVE', [
            'status' => 'EXPIRED',
        ], ['Prefer: return=representation']);

        if ($upd['ok'] && !empty($upd['data'])) {
            $expiredCount++;
            if ($lid > 0) {
                supabaseRequest('POST', '/rest/v1/alerts', [
                    'locker_id' => $lid,
                    'severity' => 'WARNING',
                    'message' => sprintf(
                        'Quá hạn lấy hàng (EXPIRED): Đơn #SL%05d của %s tại Tủ %02d đã quá hạn OTP. Cần Admin kiểm tra/reset.',
                        $bid,
                        (string) ($b['recipient_email'] ?? ''),
                        $slot
                    ),
                    'resolved' => false,
                ], ['Prefer: return=minimal']);
            }
            logAuditEvent('system@smartlocker.local', 'SYSTEM', 'BOOKING_EXPIRED', $lid, ['booking_id' => $bid]);
        }
    }

    return $expiredCount;
}

// [VẤN ĐÁP]: Thuật toán Smart Prefix OTP - Nhúng mã phân loại nhiệt độ vào chữ số đầu tiên của mã OTP 6 số.
// Đầu 1: Đồ lạnh / Nước uống (<=10°C) | Đầu 2: Đồ ăn nóng (>=40°C) | Đầu 3: Bưu kiện thường (25°C)
function generateSmartPrefixOtp(string $category, float $targetTemp): string
{
    if ($category === 'DRINK' || $targetTemp <= 10.0) {
        $prefix = '1';
    } elseif ($category === 'HOT_FOOD' || $targetTemp >= 40.0) {
        $prefix = '2';
    } else {
        $prefix = '3';
    }
    $random5 = str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT);
    return $prefix . $random5;
}

function generateReceiverOtp(): string
{
    return str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
}

// [VẤN ĐÁP]: Module AI / Physics-Informed Thermal Anomaly Detection đánh giá sai lệch nhiệt độ và tốc độ hội tụ (dT/dt).
function analyzeThermalHealth(array $locker, ?float $prevTemp = null, ?int $elapsedSec = null): array
{
    $type = strtoupper((string) ($locker['type'] ?? 'NORMAL'));
    $status = strtoupper((string) ($locker['status'] ?? 'AVAILABLE'));
    $current = (float) ($locker['current_temp'] ?? 25.0);
    $target = (float) ($locker['target_temp'] ?? 25.0);
    $pwm = (int) ($locker['pwm_power'] ?? 0);
    $doorLocked = (bool) ($locker['door_locked'] ?? true);
    $online = (bool) ($locker['online'] ?? true);
    $lockoutUntil = !empty($locker['lockout_until']) ? strtotime((string) $locker['lockout_until']) : null;

    $drift = abs($current - $target);
    $alerts = [];
    $efficiency = 100;

    if (!$online) {
        return [
            'efficiency_score' => 0,
            'has_anomaly' => true,
            'severity' => 'CRITICAL',
            'reason' => 'Mất tín hiệu kết nối ESP32 (Heartbeat Timeout)',
            'eta_minutes' => null,
        ];
    }

    if ($status === 'LOCKOUT' || ($lockoutUntil !== null && $lockoutUntil > time())) {
        $remain = $lockoutUntil ? max(1, $lockoutUntil - time()) : 60;
        $alerts[] = 'Tủ đang bị khóa an ninh Anti-Brute-Force (còn ' . $remain . ' giây)';
        $efficiency -= 60;
    }

    if ($current >= 75.0 || $current <= -10.0) {
        $alerts[] = 'Cảnh báo an toàn nhiệt cực hạn (Fail-Safe Cutoff)';
        $efficiency -= 80;
    }

    if ($status === 'OCCUPIED' && !$doorLocked) {
        $alerts[] = 'Phát hiện cửa tủ chưa đóng kín khi đang bảo quản hàng';
        $efficiency -= 45;
    }

    if (in_array($status, ['OCCUPIED', 'WAITING_DROP'], true) && $type !== 'NORMAL' && $drift > 4.0) {
        $efficiency -= min(50, (int) round($drift * 3.5));
        if ($prevTemp !== null && $elapsedSec !== null && $elapsedSec >= 10 && $pwm >= 80) {
            $ratePerMin = (($current - $prevTemp) / $elapsedSec) * 60.0;
            $needsCooling = $current > $target;
            if ($needsCooling && $ratePerMin >= -0.05) {
                $alerts[] = 'Bất thường nhiệt học (AI): PWM làm lạnh ' . $pwm . '% nhưng nhiệt không giảm (Nghi hở gioăng cửa hoặc lỗi sò Peltier)';
                $efficiency -= 35;
            } elseif (!$needsCooling && $ratePerMin <= 0.05) {
                $alerts[] = 'Bất thường nhiệt học (AI): PWM gia nhiệt ' . $pwm . '% nhưng nhiệt không tăng (Nghi đứt thanh nhiệt PTC hoặc hở cửa)';
                $efficiency -= 35;
            }
        } elseif ($drift > 6.0) {
            $alerts[] = sprintf('Chênh lệch nhiệt độ cao (%.1f°C so với mục tiêu %.1f°C)', $current, $target);
        }
    }

    $eta = ($type === 'NORMAL' || $drift <= 1.0) ? 0.0 : round($drift / 1.2, 1);
    $efficiency = max(0, min(100, $efficiency));

    return [
        'efficiency_score' => $efficiency,
        'has_anomaly' => count($alerts) > 0,
        'severity' => count($alerts) > 0 ? ($efficiency < 40 ? 'CRITICAL' : 'WARNING') : 'NORMAL',
        'reason' => count($alerts) > 0 ? implode('; ', $alerts) : 'Hệ thống điều nhiệt hoạt động tối ưu',
        'eta_minutes' => $eta,
    ];
}

function logAuditEvent(?string $actorEmail, string $actorRole, string $action, ?int $lockerId = null, array $meta = []): void
{
    supabaseRequest('POST', '/rest/v1/audit_logs', [
        'actor_email' => $actorEmail ?? 'system@smartlocker.local',
        'actor_role' => $actorRole,
        'action' => $action,
        'locker_id' => $lockerId,
        'metadata' => $meta,
    ], ['Prefer: return=minimal']);
}
