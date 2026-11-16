<?php
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/pagination.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('smartlocker_session');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    ini_set('session.use_strict_mode', '1');
    session_start();
}
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

function e($value): string { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function csrfToken(): string { return $_SESSION['csrf']; }
function csrfField(): string { return '<input type="hidden" name="csrf" value="' . e(csrfToken()) . '">'; }
function validCsrf(): bool
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf'] ?? '';
    return is_string($token) && hash_equals(csrfToken(), $token);
}
function currentUser(): ?array
{
    static $loaded = false, $user;
    if (!$loaded) {
        $loaded = true;
        $user = empty($_SESSION['user_id']) ? null : queryOne(
            'SELECT u.id, u.company_id, u.name, u.email, u.role, c.name AS company_name FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?',
            [(int) $_SESSION['user_id']]
        );
    }
    return $user;
}
function redirectTo(string $path): void { header('Location: ' . $path, true, 303); exit; }
function requireUser(): array
{
    $user = currentUser();
    if (!$user) redirectTo('login.php');
    return $user;
}
function isAdmin(): bool { $user = currentUser(); return $user && $user['role'] === 'ADMIN'; }
function notice(string $message, string $type = 'success'): void { $_SESSION['notice'] = ['message' => $message, 'type' => $type]; }
function initials(string $name): string
{
    $words = preg_split('/\s+/u', trim($name));
    return mb_strtoupper(mb_substr($words[0] ?? 'S', 0, 1) . (count($words) > 1 ? mb_substr(end($words), 0, 1) : ''));
}
function displayDate(?string $date): string
{
    if (!$date) return '—';
    $time = new DateTimeImmutable($date, new DateTimeZone('UTC'));
    return $time->setTimezone(new DateTimeZone('Asia/Bangkok'))->format('d/m/Y · H:i');
}
function categoryName(string $category): string { return ['FOOD' => 'Đồ ăn', 'DRINK' => 'Đồ uống', 'PARCEL' => 'Bưu kiện'][$category] ?? $category; }
function statusName(string $status): string { return ['ACTIVE' => 'Chờ nhận', 'COLLECTED' => 'Đã nhận', 'CANCELLED' => 'Đã hủy', 'AVAILABLE' => 'Trống', 'OCCUPIED' => 'Đang dùng', 'ERROR' => 'Bảo trì', 'OPEN' => 'Đang xử lý', 'CLOSED' => 'Đã đóng'][$status] ?? $status; }
function statusBadge(string $status): string { return '<span class="status-badge status-' . e(strtolower($status)) . '"><i></i>' . e(statusName($status)) . '</span>'; }

function appLockers(): array
{
    $user = currentUser();
    if ($user) return queryAll('SELECT id, slot, type, status, current_temp, target_temp, online FROM lockers WHERE company_id = ? ORDER BY slot', [$user['company_id']]);
    $demo = require __DIR__ . '/../data/admin-lockers.php';
    return array_map(function ($locker) {
        return ['id' => $locker['id'], 'slot' => $locker['id'], 'type' => $locker['type'], 'status' => $locker['status'],
            'current_temp' => $locker['current_temp'], 'target_temp' => $locker['target_temp'], 'online' => $locker['esp_online'] ? 1 : 0];
    }, $demo);
}
function userBookings(bool $companyWide = false): array
{
    $user = currentUser();
    if (!$user) return [];
    $sql = 'SELECT b.*, l.slot, u.name AS sender_name FROM bookings b JOIN lockers l ON l.id = b.locker_id JOIN users u ON u.id = b.sender_id WHERE b.company_id = ?';
    $values = [$user['company_id']];
    if (!$companyWide || !isAdmin()) {
        $sql .= ' AND (b.sender_id = ? OR b.recipient_email = ?)';
        $values[] = $user['id']; $values[] = $user['email'];
    }
    return queryAll($sql . ' ORDER BY b.id DESC', $values);
}
function lockerStats(array $lockers): array
{
    return ['total' => count($lockers), 'available' => count(array_filter($lockers, fn($l) => $l['status'] === 'AVAILABLE')),
        'occupied' => count(array_filter($lockers, fn($l) => $l['status'] === 'OCCUPIED')),
        'issues' => count(array_filter($lockers, fn($l) => $l['status'] === 'ERROR' || !$l['online'] || ($l['type'] === 'COOL' && $l['status'] === 'OCCUPIED' && $l['current_temp'] - $l['target_temp'] > 5)))];
}
function hitRateLimit(string $key, int $maximum, int $seconds): bool
{
    $now = time();
    executeSql('INSERT INTO rate_limits (key, attempts, started_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN started_at < ? THEN 1 ELSE attempts + 1 END, started_at = CASE WHEN started_at < ? THEN excluded.started_at ELSE started_at END', [$key, $now, $now - $seconds, $now - $seconds]);
    return (int) queryOne('SELECT attempts FROM rate_limits WHERE key = ?', [$key])['attempts'] <= $maximum;
}
