<?php
/**
 * FILE: api/bootstrap.php
 * Phụ trách: Ngọc Hiếu
 * Chức năng: Khởi tạo API JSON, giao tiếp Supabase PostgREST qua cURL, xác thực JWT Supabase Auth,
 * phân quyền (user / company), bảo vệ IoT Device Key và bộ phân tích bất thường nhiệt học (Thermal AI).
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/env.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Cho phép Preflight OPTIONS nếu có gọi từ client nội bộ
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
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
    // Hỗ trợ cả tên biến chuẩn mới (SUPABASE_SECRET_KEY) và tên cũ (SUPABASE_SERVICE_ROLE_KEY)
    $secretKey = slEnv('SUPABASE_SECRET_KEY', slEnv('SUPABASE_SERVICE_ROLE_KEY', ''));
    $publishableKey = slEnv('SUPABASE_PUBLISHABLE_KEY', slEnv('SUPABASE_ANON_KEY', 'sb_publishable_c5oBHtyAsCxM1u7khnse8Q_WerTw-OJ'));

    if ($url === '' || strpos($url, 'YOUR_PROJECT') !== false) {
        jsonError('Thiếu cấu hình SUPABASE_URL trong file .env.', 500);
    }
    if ($secretKey === '' || strpos($secretKey, 'YOUR_') !== false) {
        jsonError('Chưa cấu hình SUPABASE_SECRET_KEY trong file .env. Vui lòng copy .env.example thành .env và điền khóa sb_secret_...', 503, [
            'code' => 'MISSING_SERVICE_KEY'
        ]);
    }

    return [
        'url' => $url,
        'secret_key' => $secretKey,
        'publishable_key' => $publishableKey,
    ];
}

// [VẤN ĐÁP]: Hàm gọi Supabase PostgREST API bằng cURL thuần của PHP.
// Lưu ý chuẩn API Key mới của Supabase: Khóa `sb_secret_...` KHÔNG phải là JWT nên chỉ gửi qua header `apikey`,
// tuyệt đối KHÔNG gửi `Authorization: Bearer sb_secret_...` vì PostgREST sẽ báo lỗi Invalid JWT.
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
        // Xác thực phiên người dùng (ví dụ /auth/v1/user): dùng publishable key + JWT của user
        $headers[] = 'apikey: ' . $cfg['publishable_key'];
        $headers[] = 'Authorization: Bearer ' . $bearerToken;
    } else {
        // Gọi quyền quản trị từ PHP Server: luôn gửi qua header apikey
        $headers[] = 'apikey: ' . $cfg['secret_key'];
        // Chỉ đính kèm Authorization: Bearer nếu vẫn đang dùng khóa JWT cũ (eyJ...), bỏ qua với khóa mới sb_secret_...
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

    $caPath = __DIR__ . '/../config/cacert.pem';
    if (file_exists($caPath)) {
        curl_setopt($ch, CURLOPT_CAINFO, $caPath);
    } elseif (defined('CURLOPT_SSL_VERIFYPEER')) {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
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

// [VẤN ĐÁP]: Backend PHP KHÔNG bao giờ tin user_id hay role gửi từ trình duyệt; luôn xác thực JWT trực tiếp với Supabase Auth (/auth/v1/user).
function requireAuthUser(bool $requireCompany = false): array
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
    $accountType = ($meta['account_type'] ?? '') === 'company' ? 'company' : 'user';
    if (!isset($meta['account_type']) && !empty(trim((string) ($meta['company_name'] ?? '')))) {
        $accountType = 'company';
    }

    $normalized = [
        'id' => (string) $user['id'],
        'email' => (string) ($user['email'] ?? ''),
        'full_name' => trim((string) ($meta['full_name'] ?? $meta['name'] ?? explode('@', (string) ($user['email'] ?? 'user'))[0])),
        'company_name' => trim((string) ($meta['company_name'] ?? '')),
        'account_type' => $accountType,
        'is_company' => $accountType === 'company',
        'access_token' => $token,
    ];

    if ($requireCompany && !$normalized['is_company']) {
        jsonError('Chức năng này chỉ dành cho tài khoản Quản trị Doanh nghiệp.', 403);
    }

    return $normalized;
}

// [VẤN ĐÁP]: Xác thực mạch ESP32/Wokwi bằng khóa thiết bị X-Device-Key để ngăn tấn công giả mạo dữ liệu cảm biến.
function requireIoTDeviceKey(): void
{
    $expected = slEnv('IOT_DEVICE_KEY', 'SL_ESP32_UTH_2026_SECRET');
    $provided = $_SERVER['HTTP_X_DEVICE_KEY'] ?? ($_GET['device_key'] ?? '');
    if ($provided === '' || !hash_equals($expected, (string) $provided)) {
        jsonError('Thiết bị IoT chưa được cấp quyền (Sai X-Device-Key).', 403);
    }
}

// [VẤN ĐÁP]: Thuật toán Smart Prefix OTP - Nhúng mã phân loại nhiệt độ vào chữ số đầu tiên của mã OTP 6 số.
// Đầu 1: Đồ lạnh / Nước uống (5°C) | Đầu 2: Đồ ăn nóng (55°C) hoặc Đồ ăn mát (8°C) | Đầu 3: Bưu kiện thường (25°C)
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

    if ($current >= 75.0 || $current <= -10.0) {
        $alerts[] = 'Cảnh báo an toàn nhiệt cực hạn (Fail-Safe Cutoff)';
        $efficiency -= 80;
    }

    if ($status === 'OCCUPIED' && !$doorLocked) {
        $alerts[] = 'Phát hiện cửa tủ chưa đóng kín khi đang bảo quản hàng';
        $efficiency -= 45;
    }

    // Kiểm tra tương quan năng lượng PWM và độ dốc nhiệt (dT/dt)
    if ($status === 'OCCUPIED' && $type !== 'NORMAL' && $drift > 4.0) {
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

    // Dự báo thời gian đạt nhiệt độ mục tiêu (Time-to-Target Estimation - tốc độ chuẩn ~1.2°C/phút)
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
