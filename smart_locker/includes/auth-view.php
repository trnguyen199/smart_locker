<?php
require_once __DIR__ . '/layout.php';
$register = $authMode === 'register';
$forgot = $authMode === 'forgot';
$update = $authMode === 'update-password';
$login = !$register && !$forgot && !$update;
$requestedType = $_GET['type'] ?? '';
$accountType = $register
    ? ($requestedType === 'user' ? 'user' : 'company')
    : ($requestedType === 'company' ? 'company' : 'user');
$isCompanyTab = $accountType === 'company';

if ($register) {
    $title = $isCompanyTab ? 'Đăng ký công ty' : 'Đăng ký người dùng';
    $cardHeading = $isCompanyTab ? 'Đăng ký không gian công ty' : 'Đăng ký tài khoản người dùng';
    $cardCopy = $isCompanyTab
        ? 'Tạo không gian doanh nghiệp và tài khoản quản trị viên đầu tiên.'
        : 'Tạo tài khoản cá nhân hoặc nhân viên để gửi và nhận kiện hàng.';
    $submitLabel = $isCompanyTab ? 'Đăng ký cho công ty' : 'Đăng ký tài khoản người dùng';
} elseif ($login) {
    $title = $isCompanyTab ? 'Đăng nhập doanh nghiệp' : 'Đăng nhập người dùng';
    $cardHeading = $isCompanyTab ? 'Đăng nhập doanh nghiệp' : 'Đăng nhập người dùng';
    $cardCopy = $isCompanyTab
        ? 'Truy cập không gian doanh nghiệp để quản lý hệ thống tủ và thành viên.'
        : 'Vào không gian người dùng để gửi, nhận hàng bằng OTP và xem lịch sử.';
    $submitLabel = $isCompanyTab ? 'Đăng nhập doanh nghiệp' : 'Đăng nhập người dùng';
} elseif ($forgot) {
    $title = 'Quên mật khẩu';
    $cardHeading = 'Lấy lại quyền truy cập';
    $cardCopy = 'Nhập email để nhận liên kết đặt lại mật khẩu.';
    $submitLabel = 'Gửi liên kết đặt lại';
} else {
    $title = 'Đặt mật khẩu mới';
    $cardHeading = 'Đặt mật khẩu mới';
    $cardCopy = 'Chọn mật khẩu mới cho tài khoản của bạn.';
    $submitLabel = 'Lưu mật khẩu mới';
}

pageStart($title, '', $update ? 'app' : 'auth');
?>
<div class="auth-grid">
    <section class="auth-story">
        <div class="eyebrow">KHÔNG GIAN LÀM VIỆC KẾT NỐI</div>
        <h1>Chăm sóc kiện hàng.<br>Kết nối mọi người.</h1>
        <p>Đăng nhập bằng tài khoản người dùng để gửi nhận hàng, hoặc đăng ký không gian riêng cho công ty của bạn.</p>
        <?php foreach ([
            ['locker', '9 ngăn tủ trong một giao diện', 'Bố trí vuông 3 × 3 trên máy tính và điện thoại.'],
            ['building', 'Phân tách người dùng & doanh nghiệp', 'Người dùng vào không gian cá nhân; công ty có khu vực quản trị riêng.'],
            ['shield', 'Một tài khoản cho trải nghiệm của bạn', 'Đăng nhập và quản lý phiên bằng Supabase Auth.'],
        ] as [$glyph, $label, $description]): ?>
            <div class="auth-benefit"><span class="round-icon"><?= icon($glyph) ?></span><span><strong><?= $label ?></strong><small><?= $description ?></small></span></div>
        <?php endforeach; ?>
    </section>
    <section class="auth-card">
        <?php if ($login || $register): ?>
            <div class="auth-tabs" role="tablist" aria-label="<?= $register ? 'Chọn loại đăng ký' : 'Chọn cổng đăng nhập' ?>">
                <?php if ($login): ?>
                    <button type="button" class="auth-tab <?= !$isCompanyTab ? 'active' : '' ?>" role="tab" aria-selected="<?= !$isCompanyTab ? 'true' : 'false' ?>" data-auth-tab="user"><?= icon('users') ?> Người dùng</button>
                    <button type="button" class="auth-tab <?= $isCompanyTab ? 'active' : '' ?>" role="tab" aria-selected="<?= $isCompanyTab ? 'true' : 'false' ?>" data-auth-tab="company"><?= icon('building') ?> Doanh nghiệp</button>
                <?php else: ?>
                    <button type="button" class="auth-tab <?= $isCompanyTab ? 'active' : '' ?>" role="tab" aria-selected="<?= $isCompanyTab ? 'true' : 'false' ?>" data-auth-tab="company"><?= icon('building') ?> Đăng ký công ty</button>
                    <button type="button" class="auth-tab <?= !$isCompanyTab ? 'active' : '' ?>" role="tab" aria-selected="<?= !$isCompanyTab ? 'true' : 'false' ?>" data-auth-tab="user"><?= icon('users') ?> Đăng ký người dùng</button>
                <?php endif; ?>
            </div>
        <?php endif; ?>
        <h2 data-auth-title><?= e($cardHeading) ?></h2>
        <p data-auth-subtitle><?= e($cardCopy) ?></p>
        <form data-auth-form="<?= e($authMode) ?>">
            <?php if ($register): ?>
                <input type="hidden" name="account_type" value="<?= e($accountType) ?>">
                <div class="field" data-company-field>
                    <label for="company-name" data-company-label><?= $isCompanyTab ? 'Tên công ty / Doanh nghiệp' : 'Tên công ty (không bắt buộc)' ?></label>
                    <input id="company-name" name="company_name" maxlength="150" autocomplete="organization" placeholder="<?= $isCompanyTab ? 'Công ty TNHH Smart Locker' : 'Bỏ trống nếu dùng cá nhân' ?>" <?= $isCompanyTab ? 'required' : '' ?>>
                    <small data-company-help><?= $isCompanyTab ? 'Tên công ty sẽ được dùng để tạo không gian doanh nghiệp.' : 'Nhập tên công ty nếu bạn là nhân viên thuộc doanh nghiệp.' ?></small>
                </div>
                <div class="field">
                    <label for="name" data-name-label><?= $isCompanyTab ? 'Họ và tên người quản trị' : 'Họ và tên' ?></label>
                    <input id="name" name="name" autocomplete="name" maxlength="100" placeholder="Nguyễn Minh Anh" required>
                </div>
            <?php elseif ($login): ?>
                <input type="hidden" name="login_type" value="<?= e($accountType) ?>">
            <?php endif; ?>
            <?php if (!$update): ?>
                <div class="field"><label for="email"><?= $register && $isCompanyTab ? 'Email doanh nghiệp' : 'Email' ?></label><input type="email" id="email" name="email" maxlength="254" autocomplete="username" placeholder="ban@congty.vn" required></div>
            <?php endif; ?>
            <?php if (!$forgot): ?>
                <div class="field"><label for="password"><?= $update ? 'Mật khẩu mới' : 'Mật khẩu' ?></label><input type="password" id="password" name="password" autocomplete="<?= $register || $update ? 'new-password' : 'current-password' ?>" <?= $register || $update ? 'minlength="8"' : '' ?> maxlength="128" placeholder="<?= $register || $update ? 'Ít nhất 8 ký tự' : 'Mật khẩu của bạn' ?>" required></div>
            <?php endif; ?>
            <?php if ($update): ?>
                <div class="field"><label for="password-confirm">Nhập lại mật khẩu mới</label><input type="password" id="password-confirm" name="password_confirm" autocomplete="new-password" minlength="8" maxlength="128" required></div>
            <?php endif; ?>
            <?php if ($login): ?>
                <p style="text-align:right;font-size:11px;margin-top:-5px"><a href="forgot-password.php">Quên mật khẩu?</a></p>
            <?php endif; ?>
            <div class="form-message" data-auth-message role="alert"></div>
            <button class="button button-dark button-wide" type="submit"><span data-auth-submit-label><?= e($submitLabel) ?></span> <?= icon('arrow') ?></button>
        </form>
        <?php if ($forgot || $update): ?>
            <p class="auth-bottom"><a href="login.php">Quay lại đăng nhập</a></p>
        <?php elseif ($register): ?>
            <p class="auth-bottom" data-auth-bottom>Đã có tài khoản? <a href="login.php?type=<?= e($accountType) ?>">Đăng nhập ngay</a></p>
        <?php else: ?>
            <p class="auth-bottom" data-auth-bottom>
                <?php if ($isCompanyTab): ?>
                    Chưa có không gian doanh nghiệp? <a href="register.php?type=company">Đăng ký cho công ty</a>
                <?php else: ?>
                    Chưa có tài khoản người dùng? <a href="register.php?type=user">Đăng ký người dùng</a>
                <?php endif; ?>
            </p>
            <p class="auth-alt-links" data-auth-alt>
                <?php if ($isCompanyTab): ?>
                    Bạn là cá nhân / nhân viên? <a href="login.php?type=user">Đăng nhập người dùng</a>
                <?php else: ?>
                    Bạn đại diện doanh nghiệp? <a href="register.php?type=company">Đăng ký cho công ty</a>
                <?php endif; ?>
            </p>
        <?php endif; ?>
        <p class="auth-disclaimer">Đăng nhập bằng Supabase Auth. Giao diện gửi/nhận hàng đang là bản xem trước.</p>
    </section>
</div>
<?php pageEnd(); ?>
