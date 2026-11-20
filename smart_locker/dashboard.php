<?php
require_once __DIR__ . '/includes/layout.php';
$lockers = appLockers(); $stats = lockerStats($lockers);
$bookings = viewBookings();
$active = count(array_filter($bookings, fn($b) => $b['status'] === 'ACTIVE'));
$days = [];
$zone = new DateTimeZone('Asia/Bangkok');
for ($i = 6; $i >= 0; $i--) { $day = (new DateTimeImmutable('now', $zone))->modify('-' . $i . ' days'); $days[$day->format('Y-m-d')] = ['label' => $day->format('d/m'), 'count' => 0]; }
foreach ($bookings as $booking) { $key = (new DateTimeImmutable($booking['created_at'], new DateTimeZone('UTC')))->setTimezone($zone)->format('Y-m-d'); if (isset($days[$key])) $days[$key]['count']++; }
$maximum = max(1, ...array_column($days, 'count'));
pageStart('Tổng quan', 'dashboard');
pageHeading('MỌI THỨ TRONG TẦM TAY', 'Chào bạn, một ngày tốt lành!', 'Khám phá bảng điều khiển và các giao diện giao nhận hàng.', '<a class="button button-dark" href="lockers.php">' . icon('plus') . ' Xem ngăn tủ</a>');
?>
<section class="dashboard-welcome"><div><div class="eyebrow">GIAO NHẬN GỌN GÀNG HƠN</div><h2>Kiện hàng được chăm sóc.<br>Bạn yên tâm làm việc.</h2><p>Chọn ngăn tủ phù hợp, chia sẻ mã nhận hàng và theo dõi giao dịch của bạn ngay trên webapp.</p><a class="button button-dark button-sm" href="lockers.php">Khám phá ngăn tủ <?= icon('arrow') ?></a></div><div class="welcome-decoration" aria-hidden="true"><?= icon('locker') ?></div></section>
<section class="stats-grid" aria-label="Thống kê ngăn tủ">
<?php statCard('Tổng số ngăn tủ', sprintf('%02d', $stats['total']), 'locker', 'Hệ thống tủ thông minh', '', 'total'); statCard('Ngăn tủ đang trống', sprintf('%02d', $stats['available']), 'box', 'Sẵn sàng cho kiện hàng mới', '', 'available'); statCard('Giao dịch chờ nhận', sprintf('%02d', $active), 'clock', 'Đồng bộ Supabase', 'warm', 'active'); statCard('Tổng giao dịch', sprintf('%02d', count($bookings)), 'file', 'Lịch sử giao nhận', 'blue', 'bookings'); ?>
</section>
<div class="dashboard-columns"><section class="panel"><div class="panel-head"><div><h2>Hoạt động trong tuần</h2><p>Biểu đồ minh họa cách hiển thị giao dịch trong 7 ngày</p></div><span class="panel-subtitle">7 ngày</span></div><div class="panel-body"><div class="activity-chart" role="img" aria-label="Biểu đồ minh họa 7 ngày: <?= e(implode(', ', array_map(fn($d) => $d['label'] . ': ' . $d['count'], $days))) ?>"><?php foreach ($days as $day): ?><div class="chart-column"><b><?= $day['count'] ?></b><div class="chart-bar" style="height:<?= max(3, round($day['count'] / $maximum * 100)) ?>%"></div><small><?= $day['label'] ?></small></div><?php endforeach; ?></div><div class="chart-foot"><span class="status-dot"></span>Dữ liệu minh họa, chưa kết nối giao dịch thực tế</div></div></section>
<section class="panel"><div class="panel-head"><h2>Thao tác nhanh</h2><?= icon('spark') ?></div><div class="panel-body quick-actions"><?php foreach ([['lockers.php','send','Gửi kiện hàng','Chọn ngăn tủ và tạo mã nhận'],['lockers.php?mode=receive','receive','Nhận kiện hàng','Xác nhận bằng mã OTP 6 số'],['support.php','support','Tôi cần hỗ trợ','Tìm hướng dẫn hoặc tạo yêu cầu']] as [$url,$glyph,$label,$description]): ?><a class="quick-action" href="<?= $url ?>"><span class="round-icon"><?= icon($glyph) ?></span><span><strong><?= $label ?></strong><small><?= $description ?></small></span><?= icon('chevron') ?></a><?php endforeach; ?></div></section></div>
<section class="panel"><div class="panel-head"><div><h2>Giao dịch gần đây</h2><p>Cập nhật mới nhất từ không gian giao nhận của bạn</p></div><a href="history.php">Xem tất cả <?= icon('arrow') ?></a></div><?php bookingTable(array_slice($bookings, 0, 5)); ?></section>
<?php pageEnd(); ?>
