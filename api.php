<?php
declare(strict_types=1);
/**
 * FILE: api.php
 * Phụ trách: Hà Ngọc Hiếu
 * Chức năng: Cổng định tuyến tập trung (API Gateway) kết nối Web (Nguyên),
 * Bản mô phỏng tủ nhiều ngăn (Phạm Vũ Lân) và Mạch giả lập (Duy Quách).
 */

require_once __DIR__ . '/api/bootstrap.php';

$action = strtolower(trim((string) ($_GET['action'] ?? 'health')));

switch ($action) {
    case 'health':
        jsonResponse([
            'ok' => true,
            'service' => 'Smart Locker PHP + Supabase AIoT Gateway v5',
            'author' => 'Ha Ngoc Hieu',
            'demo_mode' => isLocalDemoFallback(),
            'mqtt_wss' => slEnv('MQTT_WSS_URL', 'wss://broker.emqx.io:8084/mqtt'),
            'mqtt_topic_prefix' => slEnv('MQTT_TOPIC_PREFIX', 'uth/iot/smartlocker/nhom4'),
            'endpoints' => [
                'kiosk_state' => 'GET api.php?action=kiosk_state (Header: X-Device-Key)',
                'kiosk_door_event' => 'POST api.php?action=kiosk_door_event (Header: X-Device-Key)',
                'hardware_info' => 'GET api.php?action=hardware_info',
                'dashboard_stats' => 'GET api.php?action=dashboard_stats (mode=stats|health)',
                'cron_sweep' => 'GET api.php?action=cron_sweep (Header: X-Device-Key)',
                'mqtt_bridge' => 'POST api.php?action=mqtt_bridge (mode=heartbeat|telemetry|event)',
                'iot_sync' => 'POST api.php?action=iot_sync (Header: X-Device-Key)',
                'verify_otp' => 'POST api/verify_otp.php (Bearer JWT hoặc X-Device-Key)',
            ],
            'timestamp' => gmdate('c'),
        ]);
        break;

    case 'hardware_info':
        require __DIR__ . '/api/hardware.php';
        break;

    case 'kiosk_state':
    case 'kiosk_door_event':
        require __DIR__ . '/api/kiosk.php';
        break;

    case 'dashboard_stats':
        require __DIR__ . '/api/dashboard_stats.php';
        break;

    case 'cron_sweep':
        require __DIR__ . '/api/cron_sweep.php';
        break;

    case 'mqtt_bridge':
        require __DIR__ . '/api/mqtt_bridge.php';
        break;

    case 'iot_sync':
        $_GET['source'] = 'iot';
        require __DIR__ . '/api/lockers.php';
        break;

    case 'auth':
        require __DIR__ . '/api/auth.php';
        break;

    case 'lockers':
        require __DIR__ . '/api/lockers.php';
        break;

    case 'telemetry':
        require __DIR__ . '/api/telemetry.php';
        break;

    case 'create_booking':
        require __DIR__ . '/api/create_booking.php';
        break;

    case 'verify_otp':
        require __DIR__ . '/api/verify_otp.php';
        break;

    case 'force_open':
        require __DIR__ . '/api/force_open.php';
        break;

    case 'reset_locker':
        require __DIR__ . '/api/reset_locker.php';
        break;

    case 'account':
        require __DIR__ . '/api/account.php';
        break;

    case 'support':
        require __DIR__ . '/api/support.php';
        break;

    default:
        jsonError('Không tìm thấy action API: ' . $action, 404);
}
