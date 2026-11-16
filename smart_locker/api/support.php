<?php
require_once __DIR__ . '/bootstrap.php';
apiRequirePost();
$user = apiUser();
$action = apiText('action', 20, false) ?: 'create';
if ($action === 'close') {
    apiUser(true);
    $id = filter_var(apiInput('ticket_id'), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if (!$id || !executeSql("UPDATE support_tickets SET status = 'CLOSED' WHERE id = ? AND company_id = ? AND status = 'OPEN'", [$id, $user['company_id']])) throw new ApiError('Không tìm thấy yêu cầu đang mở.', 404, 'NOT_FOUND');
    apiResponse(['status' => 'success', 'message' => 'Đã đóng yêu cầu hỗ trợ.']);
}
if ($action !== 'create') throw new ApiError('Thao tác không hợp lệ.');
$subject = apiText('subject', 150);
$category = apiText('category', 30);
$message = apiText('message', 4000);
if (!in_array($category, ['BOOKING', 'DEVICE', 'ACCOUNT', 'OTHER'], true)) throw new ApiError('Chủ đề hỗ trợ không hợp lệ.');
if (mb_strlen($message) < 10) throw new ApiError('Vui lòng mô tả ít nhất 10 ký tự.');
if (!hitRateLimit('support:' . $user['id'], 20, 3600)) throw new ApiError('Bạn đã tạo nhiều yêu cầu. Vui lòng thử lại sau.', 429, 'RATE_LIMITED');
executeSql('INSERT INTO support_tickets (company_id, user_id, subject, category, message) VALUES (?, ?, ?, ?, ?)', [$user['company_id'], $user['id'], $subject, $category, $message]);
apiResponse(['status' => 'success', 'message' => 'Đã lưu yêu cầu để quản trị viên công ty theo dõi.', 'id' => (int) db()->lastInsertId()], 201);
