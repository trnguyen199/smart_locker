<?php
/**
 * FILE: api/telemetry.php
 * Phụ trách: Ngọc Hiếu
 * Chức năng: Trả về chuỗi thời gian nhiệt độ / độ ẩm / PWM / hiệu suất AI từ bảng `telemetry_logs`
 * trên Supabase để vẽ biểu đồ trực tiếp (Real-time Thermal Chart) trên trang `admin.php`.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET');

// Chỉ tài khoản Doanh nghiệp (Admin) mới xem biểu đồ vận hành kỹ thuật
requireAuthUser(true);

$lockerId = max(1, min(99, (int) ($_GET['locker_id'] ?? 1)));
$limit = max(5, min(60, (int) ($_GET['limit'] ?? 30)));

// [VẤN ĐÁP]: Lấy N điểm dữ liệu mới nhất theo chỉ mục (locker_id, recorded_at DESC) rồi đảo ngược để vẽ từ trái sang phải.
$query = '/rest/v1/telemetry_logs?locker_id=eq.' . $lockerId
    . '&select=id,locker_id,current_temp,target_temp,humidity,pwm_power,door_locked,has_item,efficiency_score,recorded_at'
    . '&order=recorded_at.desc&limit=' . $limit;

$res = supabaseRequest('GET', $query);
if (!$res['ok']) {
    jsonError('Không đọc được lịch sử cảm biến (telemetry_logs) từ Supabase.', 502, [
        'detail' => $res['data'],
    ]);
}

$rows = is_array($res['data']) ? array_reverse($res['data']) : [];

// Tính thống kê nhanh độ dốc nhiệt (dT/dt) giữa điểm mới nhất và điểm trước đó
$slopePerMin = 0.0;
$count = count($rows);
if ($count >= 2) {
    $prev = $rows[$count - 2];
    $curr = $rows[$count - 1];
    $t1 = strtotime((string) ($prev['recorded_at'] ?? '')) ?: 0;
    $t2 = strtotime((string) ($curr['recorded_at'] ?? '')) ?: 0;
    $dtSec = max(1, $t2 - $t1);
    $slopePerMin = round((((float) $curr['current_temp'] - (float) $prev['current_temp']) / $dtSec) * 60.0, 2);
}

jsonResponse([
    'ok' => true,
    'locker_id' => $lockerId,
    'count' => $count,
    'slope_c_per_min' => $slopePerMin,
    'points' => $rows,
]);
