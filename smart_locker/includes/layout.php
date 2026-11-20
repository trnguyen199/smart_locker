<?php
require_once __DIR__ . '/app.php';
require_once __DIR__ . '/icons.php';

function brand(): string
{
    return '<a class="brand" href="index.php"><span class="brand-mark">' . icon('box') . '</span><span>smartlocker<span class="brand-dot">.</span><small>GIAO NHẬN THÔNG MINH</small></span></a>';
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
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/webapp.css">
</head>
<body class="<?= $area === 'app' ? 'app-body auth-pending' : 'site-body' ?>" data-requires-auth="<?= $area === 'app' ? 'true' : 'false' ?>" data-active-page="<?= e($active) ?>">
<script>try{var h=JSON.parse(localStorage.getItem('smart_locker_session_hint')||'null');if(h&&h.accountType){document.body.dataset.accountType=h.accountType;document.body.dataset.authHint='1';document.body.classList.remove('auth-pending');}}catch(_){}</script>
<a class="skip-link" href="#main-content">Đến nội dung chính</a>
<?php if ($area === 'app'): ?>
    <div class="auth-loading" role="status">Đang kiểm tra phiên đăng nhập…</div>
    <noscript><p class="form-message">Vui lòng bật JavaScript để đăng nhập và xem bảng điều khiển.</p></noscript>
    <button class="sidebar-scrim" data-close-sidebar aria-label="Đóng thanh điều hướng" tabindex="-1"></button>
    <aside class="sidebar" id="app-sidebar" aria-label="Điều hướng ứng dụng">
        <?= brand() ?>
        <div class="workspace-switch"><?= icon('building') ?><span><strong data-workspace-label>Không gian người dùng</strong><small data-workspace-role>Tài khoản của bạn</small></span></div>
        <span class="nav-caption">KHÔNG GIAN LÀM VIỆC</span>
        <nav class="app-nav">
            <?php foreach ($navigation as [$key, $url, $glyph, $label]): ?>
                <a href="<?= $url ?>" class="<?= $active === $key ? 'active' : '' ?>" <?= $active === $key ? 'aria-current="page"' : '' ?>><?= icon($glyph) ?><span><?= $label ?></span><?= $key === 'lockers' ? '<small>09</small>' : '' ?></a>
            <?php endforeach; ?>
                <span class="nav-caption" data-company-only hidden>QUẢN TRỊ DOANH NGHIỆP</span>
                <a href="admin.php" data-company-only hidden class="<?= $active === 'admin' ? 'active' : '' ?>"><?= icon('shield') ?><span>Quản lý hệ thống</span></a>
                <a href="members.php" data-company-only hidden class="<?= $active === 'members' ? 'active' : '' ?>"><?= icon('users') ?><span>Thành viên & phân quyền</span></a>
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
            <div class="topbar-left"><button class="icon-button mobile-menu" data-toggle-sidebar aria-controls="app-sidebar" aria-expanded="false" aria-label="Mở điều hướng"><?= icon('menu') ?></button><span><span data-workspace-crumb>Không gian làm việc</span> <b>/</b> <strong><?= e($title) ?></strong></span></div>
            <div class="topbar-actions"><a class="topbar-help" href="support.php"><?= icon('support') ?><span>Trợ giúp</span></a><span class="topbar-divider"></span><a class="avatar" href="settings.php" data-user-initials aria-label="Tài khoản của tôi">SL</a></div>
        </header>
        <main id="main-content" class="app-content">
            <div class="environment-note" id="iot-live-banner"><span class="status-dot" id="ui-conn-dot"></span><span id="ui-conn-status">Đang kết nối Supabase + MQTT Broker (Wokwi Realtime)...</span></div>
<?php else: ?>
    <header class="site-header"><div class="site-header-inner"><?= brand() ?><button class="icon-button site-menu-toggle" data-toggle-site-menu aria-controls="site-navigation" aria-expanded="false" aria-label="Mở menu"><?= icon('menu') ?></button><nav id="site-navigation" class="site-navigation"><a href="index.php" <?= $active === 'home' ? 'aria-current="page"' : '' ?>>Trang chủ</a><a href="index.php#solutions">Giải pháp</a><a href="index.php#how-it-works">Cách hoạt động</a><a href="support.php" <?= $active === 'support' ? 'aria-current="page"' : '' ?>>Hỗ trợ</a><span class="site-nav-actions"><a class="button button-dark button-sm" href="login.php" data-guest-only>Đăng nhập <?= icon('arrow') ?></a><a href="settings.php" class="site-user-pill" data-user-only hidden data-user-name>Tài khoản</a><a class="button button-dark button-sm" href="dashboard.php" data-user-only hidden>Vào không gian <?= icon('arrow') ?></a></span></nav></div></header>
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
        <footer class="site-footer"><div class="site-container footer-grid"><div><?= brand() ?><p>Một không gian gọn gàng hơn.<br>Một trải nghiệm giao nhận tốt hơn.</p></div><div><strong>Sản phẩm</strong><a href="login.php?type=user">Đăng nhập người dùng</a><a href="register.php?type=company">Đăng ký cho công ty</a><a href="dashboard.php">Mở không gian làm việc</a></div><div><strong>Đồng hành</strong><a href="support.php">Trung tâm hỗ trợ</a><a href="support.php#faq">Câu hỏi thường gặp</a><a href="support.php#new-ticket">Gửi yêu cầu hỗ trợ</a></div></div><div class="site-container footer-bottom"><span>© <?= date('Y') ?> Smart Locker Business</span><span>Được thiết kế cho những ngày làm việc kết nối.</span></div></footer>
        <?php
    }
    echo '<script>try{var h=JSON.parse(localStorage.getItem("smart_locker_session_hint")||"null");if(h&&h.accountType){var c=h.accountType==="company",m={"[data-user-name]":h.name,"[data-user-email]":h.email,"[data-user-initials]":h.initials,"[data-company-name]":h.company||(c?"Không gian doanh nghiệp":"Chưa liên kết công ty"),"[data-workspace-label]":c?(h.company||"Không gian doanh nghiệp"):"Không gian người dùng","[data-workspace-role]":c?"Không gian doanh nghiệp · Quản trị":(h.company?"Thành viên · "+h.company:"Tài khoản cá nhân"),"[data-workspace-crumb]":c?"Không gian doanh nghiệp":"Không gian người dùng","[data-account-type-label]":c?"Doanh nghiệp (Quản trị)":"Người dùng","[data-workspace-panel-title]":c?"Không gian doanh nghiệp":"Không gian người dùng"};for(var s in m){document.querySelectorAll(s).forEach(function(el){if(el.matches("input"))el.value=m[s];else el.textContent=m[s];});}document.querySelectorAll("[data-user-only]").forEach(function(el){el.hidden=false;});document.querySelectorAll("[data-guest-only]").forEach(function(el){el.hidden=true;});document.querySelectorAll("[data-company-only]").forEach(function(el){el.hidden=!c;});document.querySelectorAll("[data-personal-only]").forEach(function(el){el.hidden=c;});if(document.body.dataset.activePage==="dashboard"&&h.name){var t=document.querySelector(".page-heading h1"),e=document.querySelector(".page-heading .eyebrow");if(t)t.textContent="Chào "+h.name+", một ngày tốt lành!";if(e)e.textContent=c?"KHÔNG GIAN DOANH NGHIỆP":"KHÔNG GIAN NGƯỜI DÙNG";}}}catch(_){}</script>';
    echo '<script src="config/supabase.js"></script>';
    echo '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>';
    echo '<script src="https://unpkg.com/mqtt/dist/mqtt.min.js"></script><script src="assets/js/supabase-client.js"></script><script src="assets/js/app.js"></script><script src="assets/js/auth.js"></script><script src="assets/js/api.js"></script>';
    foreach ($scripts as $script) echo '<script src="assets/js/' . e($script) . '"></script>';
    echo '</body></html>';
}
function pageHeading(string $eyebrow, string $title, string $description, string $actions = ''): void
{
    echo '<div class="page-heading"><div><div class="eyebrow">' . e($eyebrow) . '</div><h1>' . e($title) . '</h1><p>' . e($description) . '</p></div><div class="heading-actions">' . $actions . '</div></div>';
}
function statCard(string $label, $value, string $glyph, string $foot, string $tone = '', string $statKey = ''): void
{
    $attr = $statKey !== '' ? ' data-stat="' . e($statKey) . '"' : '';
    echo '<article class="stat-card"><div class="stat-top"><span>' . e($label) . '</span><span class="stat-icon ' . e($tone) . '">' . icon($glyph) . '</span></div><strong class="stat-value"' . $attr . '>' . e($value) . '</strong><small>' . e($foot) . '</small></article>';
}
function bookingTable(array $bookings, bool $compact = false): void
{
    if (!$bookings) {
        echo '<div class="empty-state"><span>' . icon('box') . '</span><h3>Chưa có giao dịch nào</h3><p>Giao dịch gửi và nhận hàng của bạn sẽ xuất hiện tại đây.</p><a class="button button-light button-sm" href="lockers.php">Gửi kiện hàng đầu tiên ' . icon('arrow') . '</a></div>';
        return;
    }
    echo '<div class="table-wrap"><table><thead><tr><th>Giao dịch</th><th>Ngăn tủ</th><th>Người nhận</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody data-live-bookings>';
    foreach ($bookings as $booking) echo '<tr><td><strong class="table-title">#SL' . sprintf('%05d', $booking['id']) . '</strong><small>' . e(categoryName($booking['category'])) . '</small></td><td><span class="table-locker">' . icon('locker') . ' Tủ ' . sprintf('%02d', $booking['slot']) . '</span></td><td>' . e($booking['recipient_email']) . '</td><td>' . e(displayDate($booking['created_at'])) . '</td><td>' . statusBadge($booking['status']) . '</td></tr>';
    echo '</tbody></table></div>';
}
