<?php
/**
 * FILE: api.php
 * Phụ trách: Ngọc Hiếu
 * Chức năng: Cổng định tuyến tập trung (API Gateway) + Endpoint đồng bộ dành riêng cho mạch ESP32/Wokwi (?action=iot_sync).
 */
declare(strict_types=1);

require_once __DIR__ . '/api/bootstrap.php';

$action = strtolower(trim((string) ($_GET['action'] ?? 'health')));

switch ($action) {
    case 'health':
        jsonResponse([
            'ok' => true,
            'service' => 'Smart Locker PHP + Supabase AIoT Gateway',
            'author' => 'Ha Ngoc Hieu',
            'mqtt_wss' => slEnv('MQTT_WSS_URL', 'wss://broker.emqx.io:8084/mqtt'),
            'mqtt_topic_prefix' => slEnv('MQTT_TOPIC_PREFIX', 'uth/iot/smartlocker/nhom4'),
            'timestamp' => gmdate('c'),
        ]);
        break;

    case 'iot_sync':
        // [VẤN ĐÁP]: Endpoint cầu nối HTTP cho mạch ESP32/Wokwi (chạy song song với MQTT để dự phòng khi Broker bận).
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
