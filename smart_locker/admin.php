<?php
require_once __DIR__ . '/includes/layout.php';
require_once __DIR__ . '/includes/locker-board.php';
$lockers = appLockers(); $stats = lockerStats($lockers);
$pagination = paginateItems($lockers, $_GET);
$bookings = viewBookings();
pageStart('Quản lý hệ thống', 'admin');
?>
<section class="panel permission-denied empty-state" data-personal-only hidden><span><?= icon('shield') ?></span><h3>Khu vực dành cho tài khoản doanh nghiệp</h3><p>Tài khoản hiện tại đang ở Không gian người dùng. Chỉ tài khoản đăng ký cho công ty mới truy cập được trang quản lý hệ thống.</p><div class="hero-actions" style="justify-content:center;margin-bottom:0"><a class="button button-dark button-sm" href="dashboard.php">Về không gian người dùng</a><a class="button button-light button-sm" href="settings.php">Tài khoản của tôi</a></div></section>
<div data-company-only hidden>
<?php
pageHeading('VẬN HÀNH KHÔNG GIAN CHUNG', 'Quản lý hệ thống', 'Giám sát nhiệt độ thời gian thực, phân tích bất thường AI và điều khiển khóa tủ từ xa.', '<a class="button button-light" href="members.php">' . icon('users') . ' Thành viên & phân quyền</a>');
?>
<div class="stats-grid"><?php statCard('Tổng ngăn tủ', $stats['total'], 'locker', 'Các ngăn tủ trong công ty', '', 'total'); statCard('Đang trống', $stats['available'], 'box', 'Sẵn sàng cho giao dịch mới', '', 'available'); statCard('Đang sử dụng', $stats['occupied'], 'clock', 'Đang có giao dịch chờ nhận', 'warm', 'occupied'); statCard('Cảnh báo AI / Nhiệt', $stats['issues'], 'temp', 'Cần kiểm tra nhiệt độ / kết nối', 'blue', 'issues'); ?></div>

<div class="dashboard-columns">
    <section class="panel"><div class="panel-head"><div><h2>Sơ đồ hệ thống tủ (Realtime)</h2><p>Bấm một ngăn tủ để điều khiển mở khóa, cài nhiệt độ hoặc reset.</p></div><span class="panel-subtitle">09 ngăn</span></div><div class="panel-body"><?php renderLockerBoard($pagination['items'], true); ?></div><?php require __DIR__ . '/includes/components/pagination.php'; ?></section>
    <section class="panel">
        <div class="panel-head"><h2>Giám sát AI &amp; Mô phỏng IoT</h2><?= icon('spark') ?></div>
        <div class="panel-body">
            <h3 data-company-name>Không gian doanh nghiệp</h3>
            <p class="helper-copy">Cảnh báo bất thường nhiệt học (AI Thermal Analyzer) và bộ giả lập mạch Wokwi khi trình diễn.</p>
            <div id="admin-ai-alerts" style="margin:14px 0"><p class="helper-copy">Đang tải dữ liệu phân tích nhiệt học...</p></div>
            <div class="hero-actions" style="margin-bottom:14px;flex-wrap:wrap">
                <button class="button button-dark button-sm" type="button" id="btn-toggle-sim">Bật/Tắt Giả lập Mạch</button>
                <button class="button button-danger button-sm" type="button" id="btn-sim-fault">Giả lập lỗi rò rỉ nhiệt (AI Test)</button>
            </div>
            <div class="quick-actions">
                <a class="quick-action" href="members.php"><span class="round-icon"><?= icon('users') ?></span><span><strong>Thành viên &amp; phân quyền</strong><small>Mời đồng nghiệp và gán vai trò</small></span><?= icon('chevron') ?></a>
                <a class="quick-action" href="support.php"><span class="round-icon"><?= icon('support') ?></span><span><strong>Trung tâm hỗ trợ</strong><small>Xem yêu cầu hỗ trợ từ người dùng</small></span><?= icon('chevron') ?></a>
            </div>
        </div>
    </section>
</div>

<!-- BIỂU ĐỒ NHIỆT ĐỘ THỜI GIAN THỰC TỪ BẢNG telemetry_logs + MQTT WOKWI -->
<section class="panel" style="margin-bottom:24px">
    <div class="panel-head" style="flex-wrap:wrap">
        <div>
            <h2>Biểu đồ nhiệt độ thời gian thực (telemetry_logs &amp; MQTT)</h2>
            <p id="thermal-chart-meta">So sánh nhiệt độ thực tế (DHT22) và nhiệt độ mục tiêu (Setpoint) theo thời gian thực.</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span id="chart-ai-badge" class="status-badge status-available"><i></i>Hiệu suất AI: --%</span>
            <select id="chart-locker-select" aria-label="Chọn ngăn tủ xem biểu đồ" style="border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:#fff;font-size:12px;color:var(--ink)">
                <?php for ($i = 1; $i <= 9; $i++): ?>
                    <option value="<?= $i ?>">Tủ <?= sprintf('%02d', $i) ?> <?= $i % 2 ? '(Ngăn nhiệt)' : '(Ngăn thường)' ?></option>
                <?php endfor; ?>
            </select>
            <button class="button button-light button-sm" type="button" id="btn-refresh-chart">Tải lại</button>
        </div>
    </div>
    <div class="panel-body">
        <div style="position:relative;height:280px;width:100%">
            <canvas id="thermal-live-chart" aria-label="Biểu đồ đường cong nhiệt độ thời gian thực"></canvas>
        </div>
        <div class="chart-foot" style="margin-top:14px;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <span style="display:flex;align-items:center;gap:6px"><span class="status-dot"></span>Tự động nối điểm mới khi Wokwi ESP32 hoặc Simulator gửi gói tin nhiệt độ</span>
            <span id="chart-slope-info" style="font-weight:600;color:var(--green)">Tốc độ biến thiên (dT/dt): -- °C/phút</span>
        </div>
    </div>
</section>

<section class="panel"><div class="panel-head"><div><h2>Giao dịch hệ thống</h2><p>Đồng bộ trực tiếp từ Supabase PostgreSQL</p></div></div><?php bookingTable(array_slice($bookings, 0, 10)); ?></section>

<?php foreach ($pagination['items'] as $locker): ?>
<dialog class="dialog" id="locker-detail-<?= (int) $locker['id'] ?>" aria-labelledby="locker-title-<?= (int) $locker['id'] ?>">
    <div class="dialog-head"><h2 id="locker-title-<?= (int) $locker['id'] ?>">Tủ <?= sprintf('%02d', $locker['slot']) ?> · <?= $locker['type'] === 'COOL' ? 'Ngăn giữ nhiệt/mát' : 'Ngăn thường' ?></h2><button class="icon-button" data-close-dialog aria-label="Đóng"><?= icon('close') ?></button></div>
    <div class="dialog-body">
        <dl class="definition-list">
            <dt>Trạng thái</dt><dd><?= statusBadge($locker['status']) ?></dd>
            <dt>Nhiệt độ</dt><dd data-dialog-temp><?= e($locker['current_temp']) ?>°C / Mục tiêu <?= e($locker['target_temp']) ?>°C</dd>
            <dt>Kết nối mạch</dt><dd data-dialog-online><?= $locker['online'] ? 'Có tín hiệu' : 'Mất tín hiệu' ?></dd>
            <dt>Mã OTP hiện tại</dt><dd data-dialog-otp>Đang đồng bộ...</dd>
            <dt>Đánh giá AI</dt><dd data-dialog-ai>Đang phân tích...</dd>
        </dl>
        <div class="field" style="margin-top:12px">
            <label for="temp-input-<?= (int) $locker['id'] ?>">Chỉnh nhiệt độ mục tiêu (°C)</label>
            <div style="display:flex;gap:8px">
                <input id="temp-input-<?= (int) $locker['id'] ?>" type="number" min="2" max="65" step="0.5" value="<?= e($locker['target_temp']) ?>" data-temp-input>
                <button class="button button-light button-sm" type="button" data-set-temp-btn="<?= (int) $locker['id'] ?>">Cập nhật</button>
            </div>
        </div>
        <div class="hero-actions" style="margin-bottom:0;margin-top:14px">
            <button class="button button-dark button-sm" type="button" data-force-open="<?= (int) $locker['id'] ?>">Mở khóa khẩn cấp</button>
            <button class="button button-danger button-sm" type="button" data-reset-locker="<?= (int) $locker['id'] ?>">Đặt lại / hủy giao dịch</button>
        </div>
    </div>
</dialog>
<?php endforeach; ?>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<?php pageEnd(['admin.js']); ?>
