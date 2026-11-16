<?php
require_once __DIR__ . '/includes/layout.php';
pageStart('Thành viên & phân quyền', 'members');
?>
<section class="panel permission-denied empty-state" data-personal-only hidden><span><?= icon('shield') ?></span><h3>Khu vực dành cho tài khoản doanh nghiệp</h3><p>Tài khoản hiện tại đang ở Không gian người dùng. Chỉ tài khoản đăng ký cho công ty mới quản lý được thành viên và phân quyền.</p><div class="hero-actions" style="justify-content:center;margin-bottom:0"><a class="button button-dark button-sm" href="dashboard.php">Về không gian người dùng</a><a class="button button-light button-sm" href="settings.php">Tài khoản của tôi</a></div></section>
<div data-company-only hidden>
<?php
pageHeading('CÙNG NHAU LÀM VIỆC TỐT HƠN', 'Thành viên & phân quyền', 'Bố cục quản lý thành viên dành cho doanh nghiệp.');
?>
<section class="invite-box"><div class="ticket-top"><div><h3>Mời đồng nghiệp tham gia</h3><p>Giao diện mời thành viên và phân quyền sẽ được kết nối sau.</p></div><span class="round-icon"><?= icon('users') ?></span></div><div class="field"><label for="invite-email">Email đồng nghiệp</label><input id="invite-email" type="email" placeholder="dongnghiep@congty.vn"></div><button class="button button-dark button-sm" disabled><?= icon('plus') ?> Mời thành viên</button></section><section class="panel"><div class="panel-head"><div><h2>Thành viên trong công ty</h2><p>Chưa kết nối danh sách thành viên hoặc phân quyền</p></div></div><div class="empty-state"><span><?= icon('users') ?></span><h3>Không gian dành cho đồng nghiệp</h3><p>Danh sách, vai trò và thao tác thành viên sẽ xuất hiện ở đây khi bạn bổ sung nghiệp vụ.</p></div></section>
</div>
<?php pageEnd(); ?>