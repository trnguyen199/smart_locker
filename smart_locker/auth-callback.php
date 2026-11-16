<?php
require_once __DIR__ . '/includes/layout.php';
pageStart('Xác nhận tài khoản', '', 'auth');
?>
<section class="panel auth-status"><span class="round-icon"><?= icon('shield') ?></span><h1 style="font-size:23px;margin-top:20px">Xác nhận tài khoản</h1><p data-auth-callback data-auth-status>Đang kiểm tra liên kết xác nhận…</p><a class="button button-dark" href="login.php">Về trang đăng nhập <?= icon('arrow') ?></a></section>
<?php pageEnd(); ?>
