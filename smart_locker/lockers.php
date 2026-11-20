<?php
require_once __DIR__ . '/includes/layout.php';
require_once __DIR__ . '/includes/locker-board.php';
$mode = ($_GET['mode'] ?? '') === 'receive' ? 'receive' : 'send';
$pagination = paginateItems(appLockers(), $_GET);
pageStart('Gửi & nhận hàng', 'lockers');
pageHeading('MỘT CHẠM, MỘT KẾT NỐI', 'Gửi & nhận hàng', 'Chọn ngăn tủ, thiết lập nhiệt độ bảo quản và gửi mã OTP trực tiếp xuống mạch ESP32.', '<a class="button button-light" href="history.php">' . icon('clock') . ' Lịch sử giao dịch</a>');
?>
<nav class="section-tabs" aria-label="Chức năng giao nhận"><a href="lockers.php" class="<?= $mode === 'send' ? 'active' : '' ?>" <?= $mode === 'send' ? 'aria-current="page"' : '' ?>><?= icon('send') ?> Gửi hàng</a><a href="lockers.php?mode=receive" class="<?= $mode === 'receive' ? 'active' : '' ?>" <?= $mode === 'receive' ? 'aria-current="page"' : '' ?>><?= icon('receive') ?> Nhận hàng bằng OTP</a></nav>
<?php if ($mode === 'send'): ?>
<div class="locker-workspace"><section class="panel locker-board-panel"><div class="panel-head"><div><h2>Chọn ngăn tủ của bạn</h2><p>Đồng bộ thời gian thực · 3 hàng × 3 cột</p></div><?= statusBadge('AVAILABLE') ?></div><div class="panel-body"><?php renderLockerBoard($pagination['items']); ?></div><?php require __DIR__ . '/includes/components/pagination.php'; ?></section>
<aside class="panel booking-side"><div class="panel-head"><div><h2>Thông tin gửi hàng</h2><p id="selected-locker-label">Chọn một ngăn tủ trống bên cạnh</p></div><?= icon('box') ?></div><div class="booking-prompt" id="booking-prompt"><span class="round-icon"><?= icon('locker') ?></span><h3>Một chỗ cho kiện hàng của bạn</h3><p>Các ô màu xanh là ngăn đang trống.<br>Hãy chọn một ô để cấp OTP và cài đặt nhiệt độ.</p></div>
<div class="panel-body" id="booking-form-card" hidden>
<form id="booking-form">
    <input type="hidden" id="selected_locker_id">
    <input type="hidden" id="selected_locker_type">
    <span class="helper-copy">LOẠI HÀNG &amp; CHẾ ĐỘ NHIỆT</span>
    <div class="category-grid">
        <?php foreach (['DRINK' => ['temp','Đồ uống lạnh (5°C)'], 'FOOD' => ['box','Đồ ăn mát (8°C)'], 'HOT_FOOD' => ['spark','Đồ ăn nóng (55°C)'], 'PARCEL' => ['file','Bưu kiện (25°C)']] as $category => [$glyph,$label]): ?>
            <label><input type="radio" name="category" value="<?= $category ?>" onchange="suggestTemp(this.value)"><?= icon($glyph) ?><span><?= $label ?></span></label>
        <?php endforeach; ?>
    </div>
    <div class="field"><label for="recipient-email">Email người nhận</label><input type="email" id="recipient-email" name="recipient_email" placeholder="dongnghiep@congty.vn" maxlength="254" autocomplete="off" required></div>
    <div class="temperature-box" id="temp-control-box" hidden><div><span>Nhiệt độ bảo quản</span><strong><span id="temp_display">8</span>°C</strong></div><input type="range" id="target_temp" min="2" max="65" step="0.5" value="8" aria-label="Nhiệt độ bảo quản" oninput="document.getElementById('temp_display').textContent=this.value"><small id="temp_hint">Chọn loại hàng để tự động gợi ý nhiệt độ.</small></div>
    <button class="button button-dark button-wide" id="btn-create-booking" type="submit">Xác nhận gửi hàng &amp; Cấp OTP <?= icon('arrow') ?></button>
</form>
<div id="otp-result-card" hidden style="margin-top:16px;padding:14px;border-radius:12px;background:#f0faf4;border:1px solid #a3cfbb">
    <strong style="display:block;margin-bottom:6px;color:#163d35">Đã cấp mã Smart OTP thành công!</strong>
    <small id="res-slot-info" style="display:block;margin-bottom:8px;color:#334155"></small>
    <div style="display:flex;justify-content:space-between;gap:8px;font-size:14px">
        <span>OTP Shipper: <strong id="res-shipper-otp">------</strong></span>
        <span>OTP Nhận: <strong id="res-receiver-otp">------</strong></span>
    </div>
</div>
</div></aside></div>
<?php else: ?>
<section class="panel receive-panel"><span class="round-icon"><?= icon('receive') ?></span><h2>Kiện hàng đang chờ bạn</h2><p>Nhập mã OTP 6 chữ số để mở chốt khóa ngăn tủ ngay lập tức.</p><form id="receive-otp-form"><div class="field"><label for="otp_input">Mã OTP nhận hàng / gửi hàng</label><input class="otp-input" id="otp_input" name="otp" maxlength="6" inputmode="numeric" autocomplete="off" placeholder="000000" required></div><button class="button button-dark button-wide" id="btn-verify-otp" type="submit">Xác nhận mở khóa tủ <?= icon('arrow') ?></button></form><div id="receive-result-box" hidden style="margin-top:16px;padding:12px;border-radius:10px;background:#f0faf4;border:1px solid #a3cfbb;color:#163d35;font-weight:600"></div><p class="helper-copy" style="margin-top:20px"><a href="support.php">Tìm trợ giúp <?= icon('arrow') ?></a></p></section>
<?php endif; pageEnd(['locker.js']); ?>
