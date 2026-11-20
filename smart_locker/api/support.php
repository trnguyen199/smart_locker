<?php
/**
 * FILE: api/support.php
 * Chức năng: Tạo phiếu yêu cầu hỗ trợ (support.php) và xem danh sách phiếu hỗ trợ từ Supabase.
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET', 'POST');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$user = requireAuthUser(false);

if ($method === 'GET') {
    $q = $user['is_company']
        ? '/rest/v1/support_tickets?select=*&order=created_at.desc&limit=30'
        : '/rest/v1/support_tickets?user_email=eq.' . rawurlencode($user['email']) . '&select=*&order=created_at.desc&limit=30';
    $res = supabaseRequest('GET', $q);
    jsonResponse([
        'ok' => true,
        'tickets' => ($res['ok'] && is_array($res['data'])) ? $res['data'] : [],
    ]);
}

$body = getRequestJson();
$subject = trim((string) ($body['subject'] ?? ''));
$category = trim((string) ($body['category'] ?? 'Khác'));
$message = trim((string) ($body['message'] ?? ''));

if (mb_strlen($subject) < 4 || mb_strlen($message) < 10) {
    jsonError('Vui lòng nhập tiêu đề (ít nhất 4 ký tự) và mô tả chi tiết (ít nhất 10 ký tự).', 422);
}

$res = supabaseRequest('POST', '/rest/v1/support_tickets', [
    'user_id' => $user['id'],
    'user_email' => $user['email'],
    'subject' => $subject,
    'category' => $category,
    'message' => $message,
    'status' => 'OPEN',
], ['Prefer: return=representation']);

if (!$res['ok']) {
    jsonError('Không lưu được phiếu hỗ trợ lên Supabase.', 500, ['detail' => $res['data']]);
}

jsonResponse([
    'ok' => true,
    'message' => 'Đã tiếp nhận yêu cầu hỗ trợ thành công!',
    'ticket' => $res['data'][0] ?? null,
], 201);
