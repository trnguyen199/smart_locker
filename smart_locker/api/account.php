<?php
/**
 * FILE: api/account.php
 * Chức năng: Quản lý hồ sơ người dùng (settings.php) và danh sách thành viên / lời mời của công ty (members.php).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET', 'POST', 'DELETE');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$user = requireAuthUser(false);

if ($method === 'GET') {
    $company = $user['company_name'];
    $members = [];
    if ($user['is_company'] && $company !== '') {
        $mRes = supabaseRequest('GET', '/rest/v1/company_members?company_name=eq.' . rawurlencode($company) . '&order=created_at.desc');
        $members = ($mRes['ok'] && is_array($mRes['data'])) ? $mRes['data'] : [];
    }

    jsonResponse([
        'ok' => true,
        'profile' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'full_name' => $user['full_name'],
            'company_name' => $user['company_name'],
            'account_type' => $user['account_type'],
        ],
        'members' => $members,
    ]);
}

if ($method === 'POST') {
    $body = getRequestJson();
    $action = (string) ($body['action'] ?? 'update_profile');

    if ($action === 'invite_member') {
        if (!$user['is_company']) {
            jsonError('Chỉ tài khoản doanh nghiệp mới có quyền mời thành viên.', 403);
        }
        $email = trim((string) ($body['email'] ?? ''));
        $role = strtoupper(trim((string) ($body['role'] ?? 'STAFF')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonError('Email đồng nghiệp không hợp lệ.', 422);
        }
        if (!in_array($role, ['ADMIN', 'SHIPPER', 'STAFF'], true)) {
            $role = 'STAFF';
        }

        $insRes = supabaseRequest('POST', '/rest/v1/company_members', [
            'company_name' => $user['company_name'] ?: 'Không gian doanh nghiệp',
            'member_email' => $email,
            'role' => $role,
            'status' => 'INVITED',
            'invited_by' => $user['email'],
        ], ['Prefer: return=representation']);

        if (!$insRes['ok']) {
            jsonError('Không thể lưu lời mời thành viên (có thể email đã tồn tại).', 409, ['detail' => $insRes['data']]);
        }

        logAuditEvent($user['email'], 'COMPANY_ADMIN', 'INVITE_MEMBER', null, ['email' => $email, 'role' => $role]);

        jsonResponse([
            'ok' => true,
            'message' => 'Đã mời ' . $email . ' với vai trò ' . $role . '.',
            'member' => $insRes['data'][0] ?? null,
        ], 201);
    }

    // Cập nhật tên hiển thị vào bảng profiles
    $fullName = trim((string) ($body['full_name'] ?? ''));
    if ($fullName === '' || mb_strlen($fullName) > 100) {
        jsonError('Họ và tên không hợp lệ.', 422);
    }

    supabaseRequest('POST', '/rest/v1/profiles?on_conflict=id', [
        'id' => $user['id'],
        'email' => $user['email'],
        'full_name' => $fullName,
        'company_name' => $user['company_name'],
        'account_type' => $user['account_type'],
        'updated_at' => gmdate('c'),
    ], ['Prefer: resolution=merge-duplicates,return=minimal']);

    jsonResponse([
        'ok' => true,
        'message' => 'Đã lưu thay đổi hồ sơ.',
        'full_name' => $fullName,
    ]);
}

// DELETE: Xóa thành viên khỏi không gian doanh nghiệp
if ($method === 'DELETE') {
    if (!$user['is_company']) {
        jsonError('Chỉ tài khoản doanh nghiệp mới có quyền xóa thành viên.', 403);
    }
    $memberId = (int) ($_GET['id'] ?? 0);
    if ($memberId <= 0) {
        jsonError('Thiếu ID thành viên.', 422);
    }
    supabaseRequest('DELETE', '/rest/v1/company_members?id=eq.' . $memberId);
    jsonResponse(['ok' => true, 'message' => 'Đã gỡ thành viên khỏi danh sách.']);
}
