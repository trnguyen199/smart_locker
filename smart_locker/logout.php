<?php
require_once __DIR__ . '/includes/app.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !validCsrf()) { http_response_code(403); exit('Yêu cầu không hợp lệ.'); }
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $cookie = session_get_cookie_params();
    setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $cookie['path'], 'secure' => $cookie['secure'], 'httponly' => true, 'samesite' => 'Lax']);
}
session_destroy();
redirectTo('index.php');
