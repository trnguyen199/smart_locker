<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET');

$mode = strtolower(trim((string) ($_GET['mode'] ?? 'stats')));

if ($mode === 'health') {
    $envOk = slEnv('SUPABASE_SECRET_KEY', '') !== '' && strpos(slEnv('SUPABASE_SECRET_KEY', ''), 'YOUR_') === false;
    $t0 = microtime(true);
    $pingRes = $envOk ? supabaseRequest('GET', '/rest/v1/lockers?select=id&limit=1') : ['ok' => false, 'status' => 0];
    $latencyMs = round((microtime(true) - $t0) * 1000, 1);
    $allOk = $envOk && $pingRes['ok'];

    jsonResponse([
        'ok' => $allOk,
        'service' => 'Smart Locker Deep Health Check',
        'database' => ['connected' => $pingRes['ok'], 'latency_ms' => $latencyMs],
        'mqtt' => [
            'wss' => slEnv('MQTT_WSS_URL', 'wss://broker.emqx.io:8084/mqtt'),
            'topic_prefix' => slEnv('MQTT_TOPIC_PREFIX', 'uth/iot/smartlocker/nhom4'),
        ],
        'server_time' => gmdate('c'),
    ], $allOk ? 200 : 503);
}

// Stats mode
$user = requireAuthUser(false);
if (empty($user['has_locker_access'])) {
    $emptyChart = [];
    for ($i = 6; $i >= 0; $i--) {
        $emptyChart[] = ['date' => date('Y-m-d', time() - $i * 86400), 'count' => 0];
    }
    jsonResponse([
        'ok' => true,
        'has_locker_access' => false,
        'lockers' => ['total' => 0, 'available' => 0, 'occupied' => 0, 'issues' => 0, 'offline' => 0],
        'bookings' => ['total_7d' => 0, 'active' => 0, 'collected' => 0, 'expired' => 0],
        'unresolved_alerts' => 0,
        'chart_7d' => $emptyChart,
        'user_role' => $user['role'],
        'server_time' => gmdate('c'),
    ]);
}
$lockersRes = supabaseRequest('GET', '/rest/v1/lockers?select=id,slot,type,status,online,current_temp,target_temp&order=slot.asc');
$lockers = ($lockersRes['ok'] && is_array($lockersRes['data'])) ? $lockersRes['data'] : [];

$total = count($lockers);
$available = 0;
$occupied = 0;
$issues = 0;
$offline = 0;
foreach ($lockers as $l) {
    $st = $l['status'] ?? 'AVAILABLE';
    if ($st === 'AVAILABLE') $available++;
    elseif (in_array($st, ['OCCUPIED', 'WAITING_DROP', 'OPEN'], true)) $occupied++;
    if (in_array($st, ['ERROR', 'LOCKOUT'], true) || empty($l['online'])) $issues++;
    if (empty($l['online'])) $offline++;
}

$since7d = gmdate('c', time() - 7 * 86400);
$bookingsRes = supabaseRequest('GET', '/rest/v1/bookings?select=id,status,created_at&created_at=gte.' . rawurlencode($since7d) . '&order=created_at.desc&limit=200');
$bookings = ($bookingsRes['ok'] && is_array($bookingsRes['data'])) ? $bookingsRes['data'] : [];

$bStats = ['total_7d' => count($bookings), 'active' => 0, 'collected' => 0, 'expired' => 0];
$dailyCounts = [];
foreach ($bookings as $b) {
    $st = strtolower((string) ($b['status'] ?? ''));
    if (isset($bStats[$st])) $bStats[$st]++;
    $day = substr((string) ($b['created_at'] ?? ''), 0, 10);
    if ($day) $dailyCounts[$day] = ($dailyCounts[$day] ?? 0) + 1;
}

$alertsRes = supabaseRequest('GET', '/rest/v1/alerts?resolved=eq.false&select=id&limit=50');
$unresolvedAlerts = ($alertsRes['ok'] && is_array($alertsRes['data'])) ? count($alertsRes['data']) : 0;

$chartData = [];
for ($i = 6; $i >= 0; $i--) {
    $d = date('Y-m-d', time() - $i * 86400);
    $chartData[] = ['date' => $d, 'count' => $dailyCounts[$d] ?? 0];
}

jsonResponse([
    'ok' => true,
    'lockers' => ['total' => $total, 'available' => $available, 'occupied' => $occupied, 'issues' => $issues, 'offline' => $offline],
    'bookings' => $bStats,
    'unresolved_alerts' => $unresolvedAlerts,
    'chart_7d' => $chartData,
    'user_role' => $user['role'],
    'server_time' => gmdate('c'),
]);
