<?php
// Tương thích các URL cũ: api.php?action=create_booking, verify_otp, ...
require_once __DIR__ . '/api/bootstrap.php';

$routes = [
    'create_booking' => 'create_booking.php',
    'verify_otp' => 'verify_otp.php',
    'force_open' => 'force_open.php',
    'reset_locker' => 'reset_locker.php',
];
$action = $_GET['action'] ?? '';

if (!is_string($action) || !isset($routes[$action])) {
    apiResponse([
        'status' => 'error',
        'code' => 'NOT_FOUND',
        'message' => 'Không tìm thấy thao tác API.',
    ], 404);
}

require __DIR__ . '/api/' . $routes[$action];
