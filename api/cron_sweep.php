<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$isCli = (php_sapi_name() === 'cli');

if (!$isCli) {
    requireMethod('GET');
    requireIoTDeviceKey();
}

if (!function_exists('sweepExpiredBookings')) {
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
            if ($bid <= 0) continue;

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
                            'Quá hạn lấy hàng (EXPIRED): Đơn #SL%05d của %s tại Tủ %02d đã quá hạn OTP.',
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
}

$results = ['ok' => true, 'timestamp' => gmdate('c'), 'tasks' => []];

$expiredCount = sweepExpiredBookings();
$results['tasks']['sweep_expired'] = ['expired_count' => $expiredCount];

$offlineThreshold = gmdate('c', time() - 300);
$offlineRes = supabaseRequest('GET', '/rest/v1/lockers?online=eq.true&last_ping_at=lt.' . rawurlencode($offlineThreshold) . '&select=id,slot,last_ping_at&limit=20');

$offlineCount = 0;
if ($offlineRes['ok'] && is_array($offlineRes['data'])) {
    foreach ($offlineRes['data'] as $l) {
        $lid = (int) $l['id'];
        supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lid, ['online' => false, 'updated_at' => gmdate('c')], ['Prefer: return=minimal']);
        supabaseRequest('POST', '/rest/v1/alerts', [
            'locker_id' => $lid,
            'severity' => 'WARNING',
            'message' => sprintf('Mất tín hiệu ESP32: Tủ %02d không gửi ping > 5 phút.', (int) ($l['slot'] ?? $lid)),
            'resolved' => false,
        ], ['Prefer: return=minimal']);
        logAuditEvent('cron@smartlocker.local', 'SYSTEM', 'OFFLINE_DETECTED', $lid);
        $offlineCount++;
    }
}
$results['tasks']['offline_detection'] = ['offline_count' => $offlineCount];

$cutoff7d = gmdate('c', time() - 7 * 86400);
$cleanupRes = supabaseRequest('DELETE', '/rest/v1/alerts?resolved=eq.true&created_at=lt.' . rawurlencode($cutoff7d), null, ['Prefer: return=representation']);
$cleanedCount = ($cleanupRes['ok'] && is_array($cleanupRes['data'])) ? count($cleanupRes['data']) : 0;
$results['tasks']['cleanup_alerts'] = ['cleaned_count' => $cleanedCount];

if ($isCli) {
    echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
    exit(0);
}

jsonResponse($results);
