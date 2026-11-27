<?php
require_once __DIR__ . '/includes/layout.php';
pageStart('Đăng xuất', '', 'auth');
?>
<section class="panel auth-status" data-auth-logout><h1 style="font-size:23px">Đăng xuất</h1><p data-auth-status>Đang kết thúc phiên đăng nhập…</p><a class="button button-light" href="login.php">Về đăng nhập</a></section>
<?php pageEnd(); ?>