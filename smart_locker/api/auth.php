<?php
/**
 * FILE: api/auth.php
 * Chức năng: Xác thực phiên Supabase Auth JWT và đồng bộ thông tin người dùng vào bảng `profiles`.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET', 'POST');

$user = requireAuthUser(false);

// Upsert hồ sơ vào bảng profiles trên Supabase (giúp truy vấn thành viên & phân quyền đồng bộ)
supabaseRequest('POST', '/rest/v1/profiles?on_conflict=id', [
    'id' => $user['id'],
    'email' => $user['email'],
    'full_name' => $user['full_name'],
    'company_name' => $user['company_name'],
    'account_type' => $user['account_type'],
    'updated_at' => gmdate('c'),
], [
    'Prefer: resolution=merge-duplicates,return=minimal',
]);

jsonResponse([
    'ok' => true,
    'user' => [
        'id' => $user['id'],
        'email' => $user['email'],
        'full_name' => $user['full_name'],
        'company_name' => $user['company_name'],
        'account_type' => $user['account_type'],
        'is_company' => $user['is_company'],
    ],
]);
