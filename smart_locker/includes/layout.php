<?php
require_once __DIR__ . '/app.php';
require_once __DIR__ . '/icons.php';

function brand(): string
{
    return '<a class="brand" href="index.php"><span class="brand-mark">' . icon('box') . '</span><span>smartlocker<span class="brand-dot">.</span><small>BUSINESS WORKSPACE</small></span></a>';
}
function pageStart(string $title, string $active = '', string $area = 'app'): void
{
    $GLOBALS['page_area'] = $area;
    $navigation = [
        ['dashboard', 'dashboard.php', 'grid', 'Tổng quan'],
        ['lockers', 'lockers.php', 'locker', 'Gửi & nhận hàng'],
        ['history', 'history.php', 'clock', 'Lịch sử giao dịch'],
        ['support', 'support.php', 'support', 'Trung tâm hỗ trợ'],
    ];
    ?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Smart Locker Business — không gian gửi nhận hàng và quản lý ngăn tủ dành cho doanh nghiệp.">
    <meta name="theme-color" content="#163d35">
    <title><?= e($title) ?> · Smart Locker Business</title>
    <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/webapp.css">
</head>
<body class="<?= $area === 'app' ? 'app-body auth-pending' : 'site-body' ?>" data-requires-auth="<?= $area === 'app' ? 'true' : 'false' ?>" data-active-page="<?= e($active) ?>">
<a class="skip-link" href="#main-content">Đến nội dung chính</a>
<?php if ($area === 'app'): ?>
    <div class="auth-loading" role="status">Đang kiểm tra phiên đăng nhập…</div>
    <noscript><p class="form-message">Vui lòng bật JavaScript để đăng nhập và xem bảng điều khiển.</p></noscript>
    <button class="sidebar-scrim" data-close-sidebar aria-label="Đóng thanh điều hướng" tabindex="-1"></button>
    <aside class="sidebar" id="app-sidebar" aria-label="Điều hướng ứng dụng">
        <?= brand() ?>
        <div class="workspace-switch"><?= icon('building') ?><span><strong data-company-name>Không gian doanh nghiệp</strong><small>Bản xem trước giao diện</small></span></div>
        <span class="nav-caption">KHÔNG GIAN LÀM VIỆC</span>
        <nav class="app-nav">
            <?php foreach ($navigation as [$key, $url, $glyph, $label]): ?>
                <a href="<?= $url ?>" class="<?= $active === $key ? 'active' : '' ?>" <?= $active === $key ? 'aria-current="page"' : '' ?>><?= icon($glyph) ?><span><?= $label ?></span><?= $key === 'lockers' ? '<small>09</small>' : '' ?></a>
            <?php endforeach; ?>
                <span class="nav-caption">QUẢN TRỊ DOANH NGHIỆP</span>
                <a href="admin.php" class="<?= $active === 'admin' ? 'active' : '' ?>"><?= icon('shield') ?><span>Quản lý hệ thống</span></a>
                <a href="members.php" class="<?= $active === 'members' ? 'active' : '' ?>"><?= icon('users') ?><span>Thành viên & phân quyền</span></a>
            <a href="settings.php" class="<?= $active === 'settings' ? 'active' : '' ?>"><?= icon('settings') ?><span>Tài khoản của tôi</span></a>
        </nav>
        <div class="sidebar-bottom">
            <div class="sidebar-help"><span class="help-icon"><?= icon('support') ?></span><strong>Cần một chút hỗ trợ?</strong><p>Hướng dẫn sử dụng và giải đáp ở cùng một nơi.</p><a href="support.php">Đến trung tâm hỗ trợ <?= icon('arrow') ?></a></div>
            <a class="back-site" href="index.php"><?= icon('arrow-up') ?> Về trang chủ</a>
            <div class="sidebar-user"><span class="avatar" data-user-initials>SL</span><span><strong data-user-name>Tài khoản của bạn</strong><small>Đăng nhập bằng Supabase</small></span><a href="settings.php" aria-label="Tài khoản của tôi"><?= icon('chevron') ?></a></div>
        </div>
    </aside>
    <div class="app-shell">
        <header class="app-topbar">
            <div class="topbar-left"><button class="icon-button mobile-menu" data-toggle-sidebar aria-controls="app-sidebar" aria-expanded="false" aria-label="Mở điều hướng"><?= icon('menu') ?></button><span>Không gian làm việc <b>/</b> <strong><?= e($title) ?></strong></span></div>
            <div class="topbar-actions"><a class="topbar-help" href="support.php"><?= icon('support') ?><span>Trợ giúp</span></a><span class="topbar-divider"></span><a class="avatar" href="settings.php" data-user-initials aria-label="Tài khoản của tôi">SL</a></div>
        </header>
        <main id="main-content" class="app-content">
            <div class="environment-note"><span class="status-dot"></span><span>Bản xem trước giao diện · Dữ liệu minh họa. Các thao tác gửi/nhận hàng chưa được kết nối.</span></div>
<?php else: ?>
    <header class="site-header"><div class="site-header-inner"><?= brand() ?><button class="icon-button site-menu-toggle" data-toggle-site-menu aria-controls="site-navigation" aria-expanded="false" aria-label="Mở menu"><?= icon('menu') ?></button><nav id="site-navigation" class="site-navigation"><a href="index.php" <?= $active === 'home' ? 'aria-current="page"' : '' ?>>Trang chủ</a><a href="index.php#solutions">Giải pháp</a><a href="index.php#how-it-works">Cách hoạt động</a><a href="support.php" <?= $active === 'support' ? 'aria-current="page"' : '' ?>>Hỗ trợ</a><span class="site-nav-actions"><a href="login.php" data-guest-only>Đăng nhập</a><a href="dashboard.php" data-user-only hidden>Không gian của tôi</a><a class="button button-dark button-sm" href="dashboard.php">Mở webapp <?= icon('arrow') ?></a></span></nav></div></header>
    <main id="main-content" class="<?= $area === 'auth' ? 'auth-main' : '' ?>">
<?php endif; ?>
    <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="true"></div>
    <?php
}
function pageEnd(array $scripts = []): void
{
    $area = $GLOBALS['page_area'] ?? 'app';
    echo '</main>';
    if ($area === 'app') {
        echo '<footer class="app-footer"><span>© ' . date('Y') . ' Smart Locker Business</span><span>Đơn giản hóa mỗi lần giao nhận.</span></footer></div>';
    } else {
        ?>
        <footer class="site-footer"><div class="site-container footer-grid"><div><?= brand() ?><p>Một không gian gọn gàng hơn.<br>Một trải nghiệm giao nhận tốt hơn.</p></div><div><strong>Sản phẩm</strong><a href="dashboard.php">Khám phá webapp</a><a href="lockers.php">Gửi & nhận hàng</a><a href="register.php">Dành cho doanh nghiệp</a></div><div><strong>Đồng hành</strong><a href="support.php">Trung tâm hỗ trợ</a><a href="support.php#faq">Câu hỏi thường gặp</a><a href="support.php#new-ticket">Gửi yêu cầu hỗ trợ</a></div></div><div class="site-container footer-bottom"><span>© <?= date('Y') ?> Smart Locker Business</span><span>Được thiết kế cho những ngày làm việc kết nối.</span></div></footer>
        <?php
    }
    echo '<script src="config/supabase.js"></script>';
    echo '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
    echo '<script src="assets/js/supabase-client.js"></script><script src="assets/js/app.js"></script><script src="assets/js/auth.js"></script>';
    foreach ($scripts as $script) echo '<script src="assets/js/' . e($script) . '"></script>';
    echo '</body></html>';
}
function pageHeading(string $eyebrow, string $title, string $description, string $actions = ''): void
{
    echo '<div class="page-heading"><div><div class="eyebrow">' . e($eyebrow) . '</div><h1>' . e($title) . '</h1><p>' . e($description) . '</p></div><div class="heading-actions">' . $actions . '</div></div>';
}
function statCard(string $label, $value, string $glyph, string $foot, string $tone = ''): void
{
    echo '<article class="stat-card"><div class="stat-top"><span>' . e($label) . '</span><span class="stat-icon ' . e($tone) . '">' . icon($glyph) . '</span></div><strong class="stat-value">' . e($value) . '</strong><small>' . e($foot) . '</small></article>';
}
function bookingTable(array $bookings, bool $compact = false): void
{
    if (!$bookings) {
        echo '<div class="empty-state"><span>' . icon('box') . '</span><h3>Chưa có giao dịch nào</h3><p>Giao dịch gửi và nhận hàng của bạn sẽ xuất hiện tại đây.</p><a class="button button-light button-sm" href="lockers.php">Gửi kiện hàng đầu tiên ' . icon('arrow') . '</a></div>';
        return;
    }
    echo '<div class="table-wrap"><table><thead><tr><th>Giao dịch</th><th>Ngăn tủ</th><th>Người nhận</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>';
    foreach ($bookings as $booking) echo '<tr><td><strong class="table-title">#SL' . sprintf('%05d', $booking['id']) . '</strong><small>' . e(categoryName($booking['category'])) . '</small></td><td><span class="table-locker">' . icon('locker') . ' Tủ ' . sprintf('%02d', $booking['slot']) . '</span></td><td>' . e($booking['recipient_email']) . '</td><td>' . e(displayDate($booking['created_at'])) . '</td><td>' . statusBadge($booking['status']) . '</td></tr>';
    echo '</tbody></table></div>';
}
