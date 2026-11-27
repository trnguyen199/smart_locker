<?php
// Chỉ cung cấp hàm hiển thị và dữ liệu minh họa. Không có kết nối cơ sở dữ liệu.
require_once __DIR__ . '/pagination.php';
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header('Cache-Control: no-store');

function e($value): string { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function displayDate(?string $date): string
{
    if (!$date) return '—';
    return (new DateTimeImmutable($date, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Bangkok'))->format('d/m/Y · H:i');
}
function categoryName(string $category): string { return ['FOOD' => 'Đồ ăn', 'DRINK' => 'Đồ uống', 'PARCEL' => 'Bưu kiện'][$category] ?? $category; }
function statusName(string $status): string { return ['ACTIVE' => 'Chờ nhận', 'COLLECTED' => 'Đã nhận', 'CANCELLED' => 'Đã hủy', 'AVAILABLE' => 'Trống', 'OCCUPIED' => 'Đang dùng', 'ERROR' => 'Bảo trì', 'OPEN' => 'Đang xử lý', 'CLOSED' => 'Đã đóng'][$status] ?? $status; }
function statusBadge(string $status): string { return '<span class="status-badge status-' . e(strtolower($status)) . '"><i></i>' . e(statusName($status)) . '</span>'; }
function appLockers(): array
{
    $demo = require __DIR__ . '/../data/admin-lockers.php';
    return array_map(function ($locker) {
        return ['id' => $locker['id'], 'slot' => $locker['id'], 'type' => $locker['type'], 'status' => $locker['status'],
            'current_temp' => $locker['current_temp'], 'target_temp' => $locker['target_temp'], 'online' => $locker['esp_online'] ? 1 : 0];
    }, $demo);
}
function viewBookings(): array { return require __DIR__ . '/../data/view-bookings.php'; }
function lockerStats(array $lockers): array
{
    return ['total' => count($lockers), 'available' => count(array_filter($lockers, fn($l) => $l['status'] === 'AVAILABLE')),
        'occupied' => count(array_filter($lockers, fn($l) => $l['status'] === 'OCCUPIED')),
        'issues' => count(array_filter($lockers, fn($l) => $l['status'] === 'ERROR' || !$l['online'] || ($l['type'] === 'COOL' && $l['status'] === 'OCCUPIED' && $l['current_temp'] - $l['target_temp'] > 5)))];
}
