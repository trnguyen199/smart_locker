<?php
/**
 * FILE: api/account.php
 * Chức năng: Quản lý hồ sơ người dùng (settings.php) và quản trị thành viên / phân quyền doanh nghiệp (members.php).
 * Hỗ trợ: GET (lấy hồ sơ + thành viên), POST (cập nhật tên / mời thành viên), PATCH (đổi vai trò), DELETE (gỡ thành viên).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET', 'POST', 'PATCH', 'DELETE');

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
            'role' => $user['role'],
            'has_locker_access' => $user['has_locker_access'] ?? $user['is_company'],
        ],
        'members' => $members,
    ]);
}

if ($method === 'POST') {
    $body = getRequestJson();
    $action = (string) ($body['action'] ?? 'update_profile');

    if ($action === 'invite_member') {
        if (!$user['is_company']) {
            jsonError('Chỉ tài khoản doanh nghiệp (ADMIN) mới có quyền mời thành viên.', 403);
        }
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $role = strtoupper(trim((string) ($body['role'] ?? 'STAFF')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonError('Email đồng nghiệp không hợp lệ.', 422);
        }
        if (!in_array($role, ['ADMIN', 'SHIPPER', 'STAFF'], true)) {
            $role = 'STAFF';
        }

        if ($user['company_name'] === '') {
            jsonError('Tài khoản quản trị chưa được gắn với công ty hợp lệ.', 409);
        }

        $dupRes = supabaseRequest(
            'GET',
            '/rest/v1/company_members?company_name=eq.' . rawurlencode($user['company_name'])
            . '&member_email=ilike.' . rawurlencode($email) . '&select=id&limit=1'
        );
        if ($dupRes['ok'] && is_array($dupRes['data']) && !empty($dupRes['data'])) {
            jsonError('Email ' . $email . ' đã nằm trong danh sách thành viên công ty.', 409);
        }

        $insRes = supabaseRequest('POST', '/rest/v1/company_members', [
            'company_name' => $user['company_name'],
            'member_email' => $email,
            'role' => $role,
            'status' => 'INVITED',
            'invited_by' => $user['email'],
        ], ['Prefer: return=representation']);

        if (!$insRes['ok']) {
            jsonError('Không thể lưu lời mời thành viên (có thể email đã tồn tại trong công ty).', 409, ['detail' => $insRes['data']]);
        }

        logAuditEvent($user['email'], $user['role'], 'INVITE_MEMBER', null, ['email' => $email, 'role' => $role]);

        jsonResponse([
            'ok' => true,
            'message' => 'Đã mời ' . $email . ' với vai trò ' . $role . '.',
            'member' => $insRes['data'][0] ?? null,
        ], 201);
    }

    // Cập nhật tên hiển thị vào bảng profiles
    $fullName = trim((string) ($body['full_name'] ?? ''));
    if ($fullName === '' || mb_strlen($fullName) > 100) {
        jsonError('Họ và tên không hợp lệ (1–100 ký tự).', 422);
    }

    supabaseRequest('POST', '/rest/v1/profiles?on_conflict=id', [
        'id' => $user['id'],
        'email' => $user['email'],
        'full_name' => $fullName,
        'company_name' => $user['company_name'],
        'account_type' => $user['account_type'],
        'updated_at' => gmdate('c'),
    ], ['Prefer: resolution=merge-duplicates,return=minimal']);

    logAuditEvent($user['email'], $user['role'], 'UPDATE_PROFILE', null, ['full_name' => $fullName]);

    jsonResponse([
        'ok' => true,
        'message' => 'Đã lưu thay đổi hồ sơ thành công.',
        'full_name' => $fullName,
    ]);
}

if ($method === 'PATCH') {
    if (!$user['is_company']) {
        jsonError('Chỉ tài khoản doanh nghiệp mới có quyền thay đổi vai trò thành viên.', 403);
    }
    $body = getRequestJson();
    $memberId = (int) ($body['id'] ?? 0);
    $role = strtoupper(trim((string) ($body['role'] ?? 'STAFF')));
    if ($memberId <= 0 || !in_array($role, ['ADMIN', 'SHIPPER', 'STAFF'], true)) {
        jsonError('Thiếu ID thành viên hoặc vai trò không hợp lệ (ADMIN, SHIPPER, STAFF).', 422);
    }

    $patch = supabaseRequest('PATCH', '/rest/v1/company_members?id=eq.' . $memberId
        . '&company_name=eq.' . rawurlencode($user['company_name']), [
        'role' => $role,
    ], ['Prefer: return=representation']);

    if (!$patch['ok'] || empty($patch['data'])) {
        jsonError('Không tìm thấy thành viên cần cập nhật.', 404);
    }

    logAuditEvent($user['email'], $user['role'], 'UPDATE_MEMBER_ROLE', null, ['member_id' => $memberId, 'role' => $role]);

    jsonResponse([
        'ok' => true,
        'message' => 'Đã cập nhật vai trò thành ' . $role . '.',
        'member' => $patch['data'][0],
    ]);
}

if ($method === 'DELETE') {
    if (!$user['is_company']) {
        jsonError('Chỉ tài khoản doanh nghiệp mới có quyền gỡ thành viên.', 403);
    }
    $memberId = (int) ($_GET['id'] ?? 0);
    if ($memberId <= 0) {
        jsonError('Thiếu ID thành viên.', 422);
    }
    $deleted = supabaseRequest(
        'DELETE',
        '/rest/v1/company_members?id=eq.' . $memberId . '&company_name=eq.' . rawurlencode($user['company_name']),
        null,
        ['Prefer: return=representation']
    );
    if (!$deleted['ok'] || empty($deleted['data'])) {
        jsonError('Không tìm thấy thành viên thuộc công ty của bạn.', 404);
    }
    logAuditEvent($user['email'], $user['role'], 'REMOVE_MEMBER', null, ['member_id' => $memberId]);
    jsonResponse(['ok' => true, 'message' => 'Đã gỡ thành viên khỏi danh sách công ty.']);
}
