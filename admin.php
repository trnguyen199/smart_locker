<?php
require_once __DIR__ . '/includes/layout.php';
require_once __DIR__ . '/includes/locker-board.php';
require_once __DIR__ . '/config/env.php';
$simUrl = rtrim(slEnv('SIM_SERVER_URL', 'http://127.0.0.1:3001'), '/');
$lockers = appLockers(); $stats = lockerStats($lockers);
$pagination = paginateItems($lockers, $_GET);
$bookings = viewBookings();
pageStart('Quản lý hệ thống & Giám sát mạch', 'admin');
?>
<section class="panel permission-denied empty-state" data-personal-only hidden><span><?= icon('shield') ?></span><h3>Khu vực dành cho tài khoản doanh nghiệp</h3><p>Tài khoản hiện tại đang ở Không gian người dùng. Chỉ tài khoản quản trị doanh nghiệp mới truy cập được trang giám sát hệ thống và mạch.</p><div class="hero-actions" style="justify-content:center;margin-bottom:0"><a class="button button-dark button-sm" href="dashboard.php">Về không gian người dùng</a><a class="button button-light button-sm" href="settings.php">Tài khoản của tôi</a></div></section>
<div data-company-only hidden data-sim-url="<?= e($simUrl) ?>">
<?php
pageHeading('GIÁM SÁT HỆ THỐNG & MẠCH IOT', 'Quản lý hệ thống & Mạch', 'Theo dõi trạng thái hoạt động của 9 ngăn tủ, 3 mạch ESP32/Wokwi, nhiệt độ, độ ẩm và cảnh báo thời gian thực.', '<a class="button button-light" href="members.php">' . icon('users') . ' Thành viên & phân quyền</a>');
?>
<div class="stats-grid"><?php statCard('Tổng ngăn tủ', $stats['total'], 'locker', 'Hệ thống tủ thông minh'); statCard('Đang trống', $stats['available'], 'box', 'Sẵn sàng nhận giao dịch'); statCard('Đang sử dụng', $stats['occupied'], 'clock', 'Đang lưu trữ / chờ nhận', 'warm'); statCard('Cảnh báo', $stats['issues'], 'temp', 'Cần kiểm tra nhiệt độ / kết nối', 'blue'); ?></div>
<div class="dashboard-columns"><section class="panel"><div class="panel-head"><div><h2>Sơ đồ 9 ngăn tủ</h2><p>Bấm vào từng ngăn tủ để chỉnh nhiệt độ, mở khóa khẩn cấp hoặc đặt lại.</p></div><span class="panel-subtitle">09 ngăn</span></div><div class="panel-body"><?php renderLockerBoard($pagination['items'], true); ?></div><?php require __DIR__ . '/includes/components/pagination.php'; ?></section><section class="panel"><div class="panel-head"><h2>Cảnh báo AI &amp; Vận hành</h2><?= icon('building') ?></div><div class="panel-body"><h3 data-company-name>Không gian doanh nghiệp</h3><p class="helper-copy">Tình trạng kết nối mạch phần cứng và phân tích nhiệt học được cập nhật tự động mỗi giây.</p><div class="quick-actions"><a class="quick-action" href="members.php"><span class="round-icon"><?= icon('users') ?></span><span><strong>Thành viên &amp; phân quyền</strong><small>Mời nhân viên bằng email để mở quyền dùng tủ</small></span><?= icon('chevron') ?></a><a class="quick-action" href="support.php"><span class="round-icon"><?= icon('support') ?></span><span><strong>Trung tâm hỗ trợ</strong><small>Tiếp nhận và xử lý sự cố từ thành viên</small></span><?= icon('chevron') ?></a></div><p class="helper-copy" style="border-top:1px solid var(--line);padding-top:18px;margin-top:22px">Đang khởi tạo bảng điều khiển cảnh báo...</p></div></section></div>
<section class="panel"><div class="panel-head"><div><h2>Nhật ký giao dịch hệ thống</h2><p>Danh sách các giao dịch gửi/nhận gần nhất trên toàn hệ thống</p></div></div><?php bookingTable(array_slice($bookings, 0, 10)); ?></section>
<?php foreach ($pagination['items'] as $locker): ?>
<dialog class="dialog" id="locker-detail-<?= (int) $locker['id'] ?>" aria-labelledby="locker-title-<?= (int) $locker['id'] ?>"><div class="dialog-head"><h2 id="locker-title-<?= (int) $locker['id'] ?>">Tủ <?= sprintf('%02d', $locker['slot']) ?></h2><button class="icon-button" data-close-dialog aria-label="Đóng"><?= icon('close') ?></button></div><div class="dialog-body"><dl class="definition-list"><dt>Trạng thái</dt><dd><?= statusBadge($locker['status']) ?></dd><dt>Nhiệt độ</dt><dd><?= e($locker['current_temp']) ?>°C / Mục tiêu <?= e($locker['target_temp']) ?>°C</dd><dt>Tín hiệu mạch</dt><dd><?= $locker['online'] ? 'Có tín hiệu' : 'Mất tín hiệu' ?></dd></dl><p class="helper-copy">Đang tải bộ điều khiển...</p><div class="hero-actions" style="margin-bottom:0"><button class="button button-light button-sm" disabled>Mở khóa khẩn cấp</button><button class="button button-danger button-sm" disabled>Đặt lại / hủy giao dịch</button></div></div></dialog>
<?php endforeach; ?>
</div>
<?php pageEnd(['admin.js']); ?>
