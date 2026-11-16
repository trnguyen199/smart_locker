<?php
require_once __DIR__ . '/includes/layout.php';
$all = viewBookings();
$search = is_string($_GET['q'] ?? null) ? trim($_GET['q']) : '';
$searchKey = ltrim($search, '# ');
$status = is_string($_GET['status'] ?? null) ? $_GET['status'] : '';
$bookings = array_values(array_filter($all, function ($b) use ($searchKey, $status) {
    return ($status === '' || $b['status'] === $status) && ($searchKey === '' || mb_stripos('SL' . sprintf('%05d', $b['id']) . ' ' . $b['recipient_email'] . ' ' . $b['sender_name'] . ' Tủ ' . sprintf('%02d', $b['slot']), $searchKey) !== false);
}));
$pagination = paginateItems($bookings, $_GET);
pageStart('Lịch sử giao dịch', 'history');
pageHeading('TỪ LÚC GỬI ĐẾN LÚC NHẬN', 'Lịch sử giao dịch', 'Dữ liệu minh họa bố cục lịch sử; chưa đọc giao dịch từ Supabase.', '<a class="button button-dark" href="lockers.php">' . icon('plus') . ' Gửi hàng mới</a>');
?>
<div class="stats-grid"><?php statCard('Tất cả giao dịch', count($all), 'file', 'Dữ liệu mẫu'); foreach (['ACTIVE' => ['Chờ nhận','clock','warm'], 'COLLECTED' => ['Đã nhận','check',''], 'CANCELLED' => ['Đã hủy','box','blue']] as $key => [$label,$glyph,$tone]) statCard($label, count(array_filter($all, fn($b) => $b['status'] === $key)), $glyph, 'Trong toàn bộ thời gian', $tone); ?></div>
<section class="panel"><div class="panel-head"><h2>Danh sách giao dịch</h2><span class="panel-subtitle"><?= count($bookings) ?> kết quả</span></div><form class="filter-bar" method="get"><label class="search-box"><?= icon('search') ?><input type="search" name="q" value="<?= e($search) ?>" placeholder="Tìm mã giao dịch, email hoặc số tủ..." aria-label="Tìm giao dịch"></label><select name="status" aria-label="Trạng thái giao dịch"><option value="">Tất cả trạng thái</option><?php foreach (['ACTIVE','COLLECTED','CANCELLED'] as $key): ?><option value="<?= $key ?>" <?= $status === $key ? 'selected' : '' ?>><?= statusName($key) ?></option><?php endforeach; ?></select><button class="button button-light button-sm" type="submit">Lọc kết quả</button></form><?php if ($bookings): bookingTable($pagination['items']); elseif ($all): ?><div class="empty-state"><span><?= icon('search') ?></span><h3>Chưa tìm thấy giao dịch phù hợp</h3><p>Thử một từ khóa hoặc trạng thái khác.</p><a class="button button-light button-sm" href="history.php">Xóa bộ lọc</a></div><?php else: bookingTable([]); endif; require __DIR__ . '/includes/components/pagination.php'; ?></section>
<?php pageEnd(); ?>
