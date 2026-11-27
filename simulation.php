<?php
require_once __DIR__ . '/includes/layout.php';
require_once __DIR__ . '/config/env.php';
$simUrl = rtrim(slEnv('SIM_SERVER_URL', 'http://127.0.0.1:3001'), '/');
pageStart('Mô phỏng 3D', 'simulation');
pageHeading(
    'DIGITAL TWIN · MÔ PHỎNG 3D & KẾT NỐI WOKWI',
    'Mô phỏng 3D Smart Locker (9 ngăn)',
    'Quan sát trực tiếp 9 ngăn tủ 3D, màn hình cảm ứng OTP, điều chỉnh nhiệt độ, đóng mở cửa và đồng bộ thời gian thực với Wokwi (wokwi.com).',
    '<a class="button button-light" href="lockers.php">' . icon('locker') . ' Gửi &amp; nhận hàng</a> <a class="button button-dark" href="' . e($simUrl) . '" target="_blank" rel="noopener">Mở toàn màn hình ' . icon('arrow') . '</a>'
);
?>
<section class="panel" style="margin-bottom:20px;overflow:hidden">
    <div class="panel-head" style="flex-wrap:wrap;gap:10px">
        <div>
            <h2>Không gian Mô phỏng 3D Smart Locker</h2>
            <p>Mọi thao tác trên Form Web, Tủ 3D và mạch Wokwi (qua MQTT) đều đồng bộ hai chiều.</p>
        </div>
        <span class="status-badge status-available" id="sim-iframe-status"><i></i>Đang kết nối Simulator (<?= e($simUrl) ?>)</span>
    </div>
    <div id="sim-offline-note" hidden style="padding:18px 22px;background:#fff8ea;border-bottom:1px solid #f0d394;color:#6b4809;font-size:13px">
        <strong>Chưa phát hiện Simulator Server ở <code><?= e($simUrl) ?></code>.</strong>
        Hãy chạy lệnh <code>.\start-demo.ps1</code> (hoặc <code>npm run dev</code> trong thư mục <code>simulation/</code>) rồi tải lại trang.
    </div>
    <iframe
        id="smart-locker-sim-frame"
        src="<?= e($simUrl) ?>/?embed=1"
        title="Mô phỏng 3D Smart Locker"
        style="width:100%;height:1060px;border:0;display:block;background:#edf3f5"
        loading="eager"
    ></iframe>
</section>
<script>
(() => {
    const simUrl = <?= json_encode($simUrl, JSON_UNESCAPED_SLASHES) ?>;
    const badge = document.getElementById('sim-iframe-status');
    const note = document.getElementById('sim-offline-note');
    fetch(simUrl + '/api/status')
        .then(r => {
            if (!r.ok) throw new Error('offline');
            if (badge) {
                badge.className = 'status-badge status-available';
                badge.innerHTML = '<i></i>Simulator 3D đang hoạt động (' + simUrl + ')';
            }
            if (note) note.hidden = true;
        })
        .catch(() => {
            if (badge) {
                badge.className = 'status-badge status-error';
                badge.innerHTML = '<i></i>Chưa bật Simulator (' + simUrl + ')';
            }
            if (note) note.hidden = false;
        });
})();
</script>
<?php pageEnd(); ?>
