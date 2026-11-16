<?php
require_once __DIR__ . '/bootstrap.php';
apiRequirePost();
$user = apiUser();
$action = apiInput('action');
if ($action === 'profile') {
    executeSql('UPDATE users SET name = ? WHERE id = ? AND company_id = ?', [apiText('name', 100), $user['id'], $user['company_id']]);
} elseif ($action === 'rotate_invite') {
    apiUser(true);
    executeSql('UPDATE companies SET invite_code = ? WHERE id = ?', [strtoupper(bin2hex(random_bytes(8))), $user['company_id']]);
} elseif ($action === 'role') {
    apiUser(true);
    $id = filter_var(apiInput('user_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $role = apiInput('role');
    if (!$id || (int) $id === (int) $user['id'] || !in_array($role, ['ADMIN', 'MEMBER'], true)) throw new ApiError('Không thể thay đổi quyền này.');
    if (!executeSql('UPDATE users SET role = ? WHERE id = ? AND company_id = ?', [$role, $id, $user['company_id']])) throw new ApiError('Không tìm thấy thành viên.', 404, 'NOT_FOUND');
} else throw new ApiError('Không tìm thấy thao tác.', 404, 'NOT_FOUND');
apiResponse(['status' => 'success', 'message' => 'Đã lưu thay đổi.']);
