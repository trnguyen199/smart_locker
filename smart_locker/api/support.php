<?php
/**
 * FILE: api/support.php
 * Chức năng: Tạo phiếu yêu cầu hỗ trợ (support.php), xem danh sách phiếu và đóng phiếu (ADMIN).
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
requireMethod('GET', 'POST', 'PATCH');

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

if ($method === 'PATCH') {
    if (!$user['is_company']) {
        jsonError('Chỉ Quản trị viên doanh nghiệp mới có quyền đóng phiếu hỗ trợ.', 403);
    }
    $body = getRequestJson();
    $ticketId = (int) ($body['id'] ?? 0);
    $status = strtoupper(trim((string) ($body['status'] ?? 'CLOSED')));
    if ($ticketId <= 0 || !in_array($status, ['OPEN', 'CLOSED'], true)) {
        jsonError('ID phiếu hoặc trạng thái không hợp lệ.', 422);
    }
    $res = supabaseRequest('PATCH', '/rest/v1/support_tickets?id=eq.' . $ticketId, [
        'status' => $status,
    ], ['Prefer: return=representation']);
    if (!$res['ok'] || empty($res['data'])) {
        jsonError('Không tìm thấy phiếu hỗ trợ.', 404);
    }
    logAuditEvent($user['email'], $user['role'], 'UPDATE_SUPPORT_TICKET', null, ['ticket_id' => $ticketId, 'status' => $status]);
    jsonResponse(['ok' => true, 'message' => 'Đã cập nhật trạng thái phiếu hỗ trợ.', 'ticket' => $res['data'][0]]);
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

logAuditEvent($user['email'], $user['role'], 'CREATE_SUPPORT_TICKET', null, ['subject' => $subject]);

jsonResponse([
    'ok' => true,
    'message' => 'Đã tiếp nhận yêu cầu hỗ trợ thành công!',
    'ticket' => $res['data'][0] ?? null,
], 201);
