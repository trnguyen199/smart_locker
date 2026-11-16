<?php
require_once __DIR__ . '/bootstrap.php';
apiRequirePost();
$action = apiInput('action');
$email = mb_strtolower(apiText('email', 254));
$password = $_POST['password'] ?? null;
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !is_string($password) || strlen($password) > 72 || $password === '') throw new ApiError('Email hoặc mật khẩu không hợp lệ.');
$clientKey = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'local') . ':' . $email);
if ($action === 'login') {
    if (!hitRateLimit('login:' . $clientKey, 10, 900)) throw new ApiError('Đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.', 429, 'RATE_LIMITED');
    $user = queryOne('SELECT * FROM users WHERE email = ?', [$email]);
    $hash = $user['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
    if (!password_verify($password, $hash) || !$user) throw new ApiError('Email hoặc mật khẩu chưa đúng.', 401, 'INVALID_CREDENTIALS');
    executeSql('DELETE FROM rate_limits WHERE key = ?', ['login:' . $clientKey]);
    $userId = (int) $user['id'];
} elseif ($action === 'register') {
    if (strlen($password) < 10) throw new ApiError('Mật khẩu cần ít nhất 10 ký tự, tối đa 72 byte.');
    if (!hitRateLimit('register:' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'local'), 30, 3600)) throw new ApiError('Vui lòng thử đăng ký lại sau.', 429, 'RATE_LIMITED');
    $name = apiText('name', 100);
    $companyName = apiText('company_name', 150, false);
    $invite = strtoupper(apiText('invite_code', 32, false));
    if ($invite === '' && $companyName === '') throw new ApiError('Nhập tên công ty hoặc mã mời của công ty.');
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $userId = atomic(function () use ($email, $passwordHash, $name, $companyName, $invite) {
        if (queryOne('SELECT id FROM users WHERE email = ?', [$email])) throw new ApiError('Email này đã có tài khoản.', 409, 'EMAIL_EXISTS');
        if ($invite !== '') {
            $company = queryOne('SELECT id FROM companies WHERE invite_code = ?', [$invite]);
            if (!$company) throw new ApiError('Mã mời không đúng. Hãy liên hệ quản trị viên công ty.');
            $companyId = (int) $company['id']; $role = 'MEMBER';
        } else {
            executeSql('INSERT INTO companies (name, invite_code) VALUES (?, ?)', [$companyName, strtoupper(bin2hex(random_bytes(8)))]);
            $companyId = (int) db()->lastInsertId(); $role = 'ADMIN';
            seedCompanyLockers($companyId);
        }
        executeSql('INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [$companyId, $name, $email, $passwordHash, $role]);
        return (int) db()->lastInsertId();
    });
} else throw new ApiError('Không tìm thấy thao tác.', 404, 'NOT_FOUND');
session_regenerate_id(true);
$_SESSION['user_id'] = $userId;
$_SESSION['csrf'] = bin2hex(random_bytes(32));
apiResponse(['status' => 'success', 'redirect' => 'dashboard.php'], $action === 'register' ? 201 : 200);
