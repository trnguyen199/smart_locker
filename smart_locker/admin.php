<?php
require_once __DIR__ . '/includes/layout.php';
require_once __DIR__ . '/includes/locker-board.php';
$lockers = appLockers(); $stats = lockerStats($lockers);
$pagination = paginateItems($lockers, $_GET);
$bookings = viewBookings();
pageStart('Quản lý hệ thống', 'admin');
?>
<section class="panel permission-denied empty-state" data-personal-only hidden><span><?= icon('shield') ?></span><h3>Khu vực dành cho tài khoản doanh nghiệp</h3><p>Tài khoản hiện tại đang ở Không gian người dùng. Chỉ tài khoản đăng ký cho công ty mới truy cập được trang quản lý hệ thống.</p><div class="hero-actions" style="justify-content:center;margin-bottom:0"><a class="button button-dark button-sm" href="dashboard.php">Về không gian người dùng</a><a class="button button-light button-sm" href="settings.php">Tài khoản của tôi</a></div></section>
<div data-company-only hidden>
<?php
pageHeading('VẬN HÀNH KHÔNG GIAN CHUNG', 'Quản lý hệ thống', 'Xem bố cục quản lý và dữ liệu ngăn tủ minh họa.', '<a class="button button-light" href="members.php">' . icon('users') . ' Xem trang thành viên</a>');
?>
<div class="stats-grid"><?php statCard('Tổng ngăn tủ', $stats['total'], 'locker', 'Các ngăn tủ trong công ty'); statCard('Đang trống', $stats['available'], 'box', 'Sẵn sàng cho giao dịch mới'); statCard('Đang sử dụng', $stats['occupied'], 'clock', 'Đang có giao dịch chờ nhận', 'warm'); statCard('Cảnh báo', $stats['issues'], 'temp', 'Cần kiểm tra nhiệt độ / kết nối', 'blue'); ?></div>
<div class="dashboard-columns"><section class="panel"><div class="panel-head"><div><h2>Sơ đồ hệ thống tủ</h2><p>Bấm một ngăn tủ để xem thông tin minh họa.</p></div><span class="panel-subtitle">09 ngăn</span></div><div class="panel-body"><?php renderLockerBoard($pagination['items'], true); ?></div><?php require __DIR__ . '/includes/components/pagination.php'; ?></section><section class="panel"><div class="panel-head"><h2>Không gian doanh nghiệp</h2><?= icon('building') ?></div><div class="panel-body"><h3 data-company-name>Không gian doanh nghiệp</h3><p class="helper-copy">Khung giao diện quản lý ngăn tủ, thành viên và hỗ trợ. Dữ liệu hiển thị chỉ là minh họa.</p><div class="quick-actions"><a class="quick-action" href="members.php"><span class="round-icon"><?= icon('users') ?></span><span><strong>Thành viên & phân quyền</strong><small>Xem bố cục trang thành viên</small></span><?= icon('chevron') ?></a><a class="quick-action" href="support.php"><span class="round-icon"><?= icon('support') ?></span><span><strong>Trung tâm hỗ trợ</strong><small>Hướng dẫn và biểu mẫu hỗ trợ</small></span><?= icon('chevron') ?></a></div><p class="helper-copy" style="border-top:1px solid var(--line);padding-top:18px;margin-top:22px">Các nút điều khiển đang tắt để bạn tự kết nối nghiệp vụ sau.</p></div></section></div>
<section class="panel"><div class="panel-head"><div><h2>Giao dịch minh họa</h2><p>Dữ liệu mẫu để xem bố cục hiển thị</p></div></div><?php bookingTable(array_slice($bookings, 0, 10)); ?></section>
<?php foreach ($pagination['items'] as $locker): ?>
<dialog class="dialog" id="locker-detail-<?= (int) $locker['id'] ?>" aria-labelledby="locker-title-<?= (int) $locker['id'] ?>"><div class="dialog-head"><h2 id="locker-title-<?= (int) $locker['id'] ?>">Tủ <?= sprintf('%02d', $locker['slot']) ?> · <?= $locker['type'] === 'COOL' ? 'Ngăn mát' : 'Ngăn thường' ?></h2><button class="icon-button" data-close-dialog aria-label="Đóng"><?= icon('close') ?></button></div><div class="dialog-body"><dl class="definition-list"><dt>Trạng thái</dt><dd><?= statusBadge($locker['status']) ?></dd><dt>Nhiệt độ</dt><dd><?= e($locker['current_temp']) ?>°C / Mục tiêu <?= e($locker['target_temp']) ?>°C</dd><dt>Kết nối minh họa</dt><dd><?= $locker['online'] ? 'Có tín hiệu' : 'Mất tín hiệu' ?></dd></dl><p class="helper-copy">Thông tin minh họa. Các thao tác điều khiển chưa được kết nối.</p><div class="hero-actions" style="margin-bottom:0"><button class="button button-light button-sm" disabled>Mở khóa khẩn cấp</button><button class="button button-danger button-sm" disabled>Đặt lại / hủy giao dịch</button></div></div></dialog>
<?php endforeach; ?>
</div>
<?php pageEnd(); ?>
