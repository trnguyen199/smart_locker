<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('POST');
requireIoTDeviceKey();

$mode = strtolower(trim((string) ($_GET['mode'] ?? 'telemetry')));
$body = getRequestJson();

// 1. HEARTBEAT
if ($mode === 'heartbeat') {
    $lockerId = (int) ($body['locker_id'] ?? 0);
    if ($lockerId <= 0) {
        supabaseRequest('PATCH', '/rest/v1/lockers?online=eq.true', ['last_ping_at' => gmdate('c')], ['Prefer: return=minimal']);
        jsonResponse(['ok' => true, 'message' => 'Heartbeat broadcast updated.']);
    }

    supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, [
        'online' => true,
        'last_ping_at' => gmdate('c'),
        'updated_at' => gmdate('c'),
    ], ['Prefer: return=minimal']);

    $cmdRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerId . '&select=pending_cmd,target_temp');
    $pending = null;
    $targetTemp = 25.0;
    if ($cmdRes['ok'] && !empty($cmdRes['data'])) {
        $pending = $cmdRes['data'][0]['pending_cmd'] ?? null;
        $targetTemp = (float) ($cmdRes['data'][0]['target_temp'] ?? 25.0);
    }

    jsonResponse(['ok' => true, 'locker_id' => $lockerId, 'pending_cmd' => $pending, 'target_temp' => $targetTemp]);
}

// 2. BATCH TELEMETRY
if ($mode === 'telemetry') {
    $readings = isset($body['readings']) && is_array($body['readings']) ? $body['readings'] : [$body];
    if (empty($readings)) {
        jsonError('Thiếu dữ liệu telemetry.', 422);
    }

    $results = [];
    foreach (array_slice($readings, 0, 9) as $r) {
        $lockerId = (int) ($r['locker_id'] ?? 0);
        if ($lockerId <= 0) continue;

        $currentTemp = round((float) ($r['current_temp'] ?? 25.0), 1);
        $humidity = round((float) ($r['humidity'] ?? 55.0), 1);
        $pwmPower = max(0, min(100, (int) ($r['pwm_power'] ?? 0)));
        $doorLocked = (bool) ($r['door_locked'] ?? true);
        $hasItem = (bool) ($r['has_item'] ?? false);

        $oldRes = supabaseRequest('GET', '/rest/v1/lockers?id=eq.' . $lockerId . '&select=*');
        if (!$oldRes['ok'] || empty($oldRes['data'])) continue;
        $old = $oldRes['data'][0];

        $prevTemp = (float) ($old['current_temp'] ?? 25.0);
        $prevTime = !empty($old['last_ping_at']) ? strtotime((string) $old['last_ping_at']) : null;
        $elapsedSec = $prevTime ? max(1, time() - $prevTime) : null;

        $updateData = [
            'current_temp' => $currentTemp,
            'humidity' => $humidity,
            'pwm_power' => $pwmPower,
            'door_locked' => $doorLocked,
            'has_item' => $hasItem,
            'online' => true,
            'last_ping_at' => gmdate('c'),
            'updated_at' => gmdate('c'),
        ];
        if (!empty($r['ack_cmd'])) $updateData['pending_cmd'] = null;

        $merged = array_merge($old, $updateData);
        $aiResult = analyzeThermalHealth($merged, $prevTemp, $elapsedSec);

        supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, $updateData, ['Prefer: return=minimal']);

        supabaseRequest('POST', '/rest/v1/telemetry_logs', [
            'locker_id' => $lockerId,
            'current_temp' => $currentTemp,
            'target_temp' => (float) ($old['target_temp'] ?? 25.0),
            'humidity' => $humidity,
            'pwm_power' => $pwmPower,
            'door_locked' => $doorLocked,
            'has_item' => $hasItem,
            'efficiency_score' => $aiResult['efficiency_score'],
        ], ['Prefer: return=minimal']);

        if ($aiResult['has_anomaly']) {
            supabaseRequest('POST', '/rest/v1/alerts', [
                'locker_id' => $lockerId,
                'severity' => $aiResult['severity'],
                'message' => $aiResult['reason'],
                'resolved' => false,
            ], ['Prefer: return=minimal']);
        }

        $results[] = [
            'locker_id' => $lockerId,
            'pending_cmd' => $merged['pending_cmd'] ?? null,
            'target_temp' => (float) ($old['target_temp'] ?? 25.0),
            'ai' => $aiResult,
        ];
    }

    jsonResponse(['ok' => true, 'processed' => count($results), 'lockers' => $results]);
}

// 3. EVENT
if ($mode === 'event') {
    $lockerId = (int) ($body['locker_id'] ?? 0);
    $event = strtoupper(trim((string) ($body['event'] ?? '')));
    if ($lockerId <= 0 || !in_array($event, ['DOOR_CLOSED', 'DOOR_OPENED', 'ACK_CMD'], true)) {
        jsonError('Payload event không hợp lệ.', 422);
    }

    if ($event === 'ACK_CMD') {
        supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, ['pending_cmd' => null, 'last_ping_at' => gmdate('c')]);
        jsonResponse(['ok' => true, 'message' => 'ACK_CMD Tủ ' . strval($lockerId)]);
    }

    if ($event === 'DOOR_OPENED') {
        supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, ['door_locked' => false, 'last_ping_at' => gmdate('c')]);
        logAuditEvent('bridge@smartlocker.local', 'IOT_BRIDGE', 'DOOR_OPENED', $lockerId);
        jsonResponse(['ok' => true, 'message' => 'DOOR_OPENED Tủ ' . strval($lockerId)]);
    }

    // DOOR_CLOSED
    $hasItem = (bool) ($body['has_item'] ?? false);
    $nextStatus = $hasItem ? 'OCCUPIED' : 'AVAILABLE';
    $patch = ['door_locked' => true, 'has_item' => $hasItem, 'status' => $nextStatus, 'pending_cmd' => null, 'last_ping_at' => gmdate('c')];
    if ($nextStatus === 'AVAILABLE') {
        $patch['active_category'] = null;
        $patch['active_shipper_otp'] = null;
        $patch['active_receiver_otp'] = null;
    }
    supabaseRequest('PATCH', '/rest/v1/lockers?id=eq.' . $lockerId, $patch);
    logAuditEvent('bridge@smartlocker.local', 'IOT_BRIDGE', 'DOOR_CLOSED', $lockerId, ['has_item' => $hasItem]);
    jsonResponse(['ok' => true, 'message' => 'DOOR_CLOSED Tủ ' . strval($lockerId) . ' -> ' . $nextStatus]);
}

jsonError('mode không hợp lệ. Chỉ chấp nhận: telemetry, heartbeat, event.', 422);
