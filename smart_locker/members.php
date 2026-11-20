<?php
require_once __DIR__ . '/includes/layout.php';
pageStart('Thành viên & phân quyền', 'members');
?>
<section class="panel permission-denied empty-state" data-personal-only hidden><span><?= icon('shield') ?></span><h3>Khu vực dành cho tài khoản doanh nghiệp</h3><p>Tài khoản hiện tại đang ở Không gian người dùng. Chỉ tài khoản đăng ký cho công ty mới quản lý được thành viên và phân quyền.</p><div class="hero-actions" style="justify-content:center;margin-bottom:0"><a class="button button-dark button-sm" href="dashboard.php">Về không gian người dùng</a><a class="button button-light button-sm" href="settings.php">Tài khoản của tôi</a></div></section>
<div data-company-only hidden>
<?php
pageHeading('CÙNG NHAU LÀM VIỆC TỐT HƠN', 'Thành viên & phân quyền', 'Mời đồng nghiệp và gán vai trò vận hành hệ thống tủ thông minh.');
?>
<section class="invite-box">
    <div class="ticket-top"><div><h3>Mời đồng nghiệp tham gia</h3><p>Lưu lời mời và phân quyền trực tiếp trên Supabase.</p></div><span class="round-icon"><?= icon('users') ?></span></div>
    <form id="invite-member-form">
        <div class="field"><label for="invite-email">Email đồng nghiệp</label><input id="invite-email" type="email" placeholder="dongnghiep@congty.vn" required></div>
        <div class="field"><label for="invite-role">Vai trò</label><select id="invite-role"><option value="STAFF">Nhân viên (Nhận / Gửi hàng)</option><option value="SHIPPER">Shipper nội bộ</option><option value="ADMIN">Quản trị viên tủ</option></select></div>
        <button class="button button-dark button-sm" type="submit"><?= icon('plus') ?> Mời thành viên</button>
    </form>
</section>
<section class="panel"><div class="panel-head"><div><h2>Thành viên trong công ty</h2><p>Danh sách đồng bộ từ Supabase</p></div></div><div id="members-list-container"><div class="empty-state"><span><?= icon('users') ?></span><h3>Đang tải danh sách thành viên...</h3></div></div></section>
</div>
<?php pageEnd(); ?>
