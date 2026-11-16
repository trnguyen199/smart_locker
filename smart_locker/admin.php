<?php
require_once __DIR__ . '/includes/pagination.php';
$lockers = require __DIR__ . '/data/admin-lockers.php';
$pagination = paginateItems($lockers, $_GET);

// Thống kê toàn bộ hệ thống, không chỉ các tủ ở trang hiện tại.
$availableCount = count(array_filter($lockers, function ($locker) {
    return $locker['status'] === 'AVAILABLE';
}));
$occupiedCount = count(array_filter($lockers, function ($locker) {
    return $locker['status'] === 'OCCUPIED';
}));
$issueCount = count(array_filter($lockers, function ($locker) {
    $tempError = $locker['type'] === 'COOL' && $locker['status'] === 'OCCUPIED'
        && ($locker['current_temp'] - $locker['target_temp']) > 5;

    return $locker['status'] === 'ERROR' || !$locker['esp_online'] || $tempError;
}));
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard - Smart Locker</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body class="bg-light">

<nav class="navbar navbar-dark bg-dark mb-4">
    <div class="container">
        <span class="navbar-brand fw-bold">🛠️ ADMIN MONITOR - SMART LOCKER</span>
        <a href="index.php" class="btn btn-outline-light btn-sm">Sang trang Người dùng ↗</a>
    </div>
</nav>

<div class="container">
    <!-- Thống kê nhanh -->
    <div class="row g-3 mb-4 text-center">
        <div class="col-md-3">
            <div class="card border-0 shadow-sm p-3">
                <small class="text-muted">Tổng số ngăn tủ</small>
                <h3 class="fw-bold mb-0"><?= count($lockers) ?></h3>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 shadow-sm p-3">
                <small class="text-muted">Đang trống</small>
                <h3 class="fw-bold text-success mb-0"><?= $availableCount ?></h3>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 shadow-sm p-3">
                <small class="text-muted">Đang sử dụng</small>
                <h3 class="fw-bold text-primary mb-0"><?= $occupiedCount ?></h3>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card border-0 shadow-sm p-3">
                <small class="text-muted">Cảnh báo lỗi mạch / nhiệt</small>
                <h3 class="fw-bold text-danger mb-0"><?= $issueCount ?></h3>
            </div>
        </div>
    </div>

    <h5 class="fw-bold mb-2">Sơ đồ ngăn tủ</h5>
    <p class="text-muted small mb-3">Bấm vào một ô tủ để xem chi tiết và điều khiển.</p>
    <div class="locker-grid admin-locker-grid" role="group" aria-label="Sơ đồ quản trị ngăn tủ, 3 cột">
        <?php if ($pagination['total'] === 0): ?>
            <p class="locker-grid-empty text-muted mb-0">Chưa có ngăn tủ nào.</p>
        <?php endif; ?>
        <?php foreach ($pagination['items'] as $l):
            $tempError = ($l['type'] === 'COOL' && $l['status'] === 'OCCUPIED' && ($l['current_temp'] - $l['target_temp']) > 5);
            $hasIssue = ($l['status'] === 'ERROR' || !$l['esp_online'] || $tempError);
            $statusLabel = $l['status'] === 'AVAILABLE' ? 'Trống' : ($l['status'] === 'OCCUPIED' ? 'Đang dùng' : 'Tạm ngưng');
            $statusColor = $l['status'] === 'AVAILABLE' ? 'success' : ($l['status'] === 'OCCUPIED' ? 'warning text-dark' : 'danger');
        ?>
        <button type="button" class="card locker-tile admin-locker-tile <?= $hasIssue ? 'has-issue' : ($l['status'] === 'AVAILABLE' ? 'available' : '') ?>"
                data-id="<?= $l['id'] ?>" data-bs-toggle="modal" data-bs-target="#locker-detail-<?= $l['id'] ?>"
                aria-label="Xem chi tiết <?= htmlspecialchars($l['code'], ENT_QUOTES, 'UTF-8') ?>, <?= $statusLabel ?><?= $hasIssue ? ', có cảnh báo' : '' ?>">
            <span class="locker-number">TỦ <?= sprintf('%02d', $l['id']) ?></span>
            <span class="locker-type"><?= $l['type'] === 'COOL' ? 'Ngăn mát' : 'Ngăn thường' ?></span>
            <strong class="locker-temperature <?= $tempError ? 'text-danger' : '' ?>"><?= $l['current_temp'] ?>°C</strong>
            <span class="badge locker-status bg-<?= $statusColor ?>"><?= $statusLabel ?><?= $hasIssue ? ' ⚠' : '' ?></span>
        </button>
        <?php endforeach; ?>
    </div>
    <?php require __DIR__ . '/includes/components/pagination.php'; ?>
</div>

<?php foreach ($pagination['items'] as $l):
    $tempError = ($l['type'] === 'COOL' && $l['status'] === 'OCCUPIED' && ($l['current_temp'] - $l['target_temp']) > 5);
?>
<div class="modal fade" id="locker-detail-<?= $l['id'] ?>" tabindex="-1" aria-labelledby="locker-detail-title-<?= $l['id'] ?>" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title fw-bold" id="locker-detail-title-<?= $l['id'] ?>"><?= $l['code'] ?></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
            </div>
            <div class="modal-body">
                <p class="mb-3">
                    <?php if ($l['esp_online']): ?>
                        <span class="badge bg-success">● Mạch ESP32: Tốt (<?= $l['last_ping'] ?>)</span>
                    <?php else: ?>
                        <span class="badge bg-danger">● Mất kết nối mạch (<?= $l['last_ping'] ?>)</span>
                    <?php endif; ?>
                </p>
                <div class="row mb-3">
                    <div class="col-6">
                        <small class="text-muted d-block">Trạng thái sử dụng</small>
                        <?php if ($l['status'] === 'AVAILABLE'): ?>
                            <span class="badge bg-success">Đang trống</span>
                        <?php elseif ($l['status'] === 'OCCUPIED'): ?>
                            <span class="badge bg-warning text-dark">Đang có hàng</span>
                        <?php else: ?>
                            <span class="badge bg-danger">Ngừng hoạt động</span>
                        <?php endif; ?>
                    </div>
                    <div class="col-6">
                        <small class="text-muted d-block">Nhiệt độ thực tế / Mục tiêu</small>
                        <strong class="<?= $tempError ? 'text-danger' : 'text-primary' ?>"><?= $l['current_temp'] ?>°C</strong>
                        <span class="text-muted">/ <?= $l['target_temp'] ?>°C</span>
                    </div>
                </div>
                <?php if ($tempError): ?>
                    <div class="alert alert-danger py-2 small mb-3">
                        ⚠️ <strong>Cảnh báo sự cố:</strong> Nhiệt độ thực tế cao hơn mức cài đặt! Kiểm tra sò lạnh Peltier hoặc cảm biến DS18B20.
                    </div>
                <?php endif; ?>
                <?php if ($l['status'] === 'OCCUPIED'): ?>
                    <div class="bg-light p-2 rounded mb-3 small">
                        Loại hàng: <strong><?= $l['category'] ?></strong> |
                        Mã OTP đang kích hoạt: <strong class="text-primary"><?= $l['otp'] ?></strong>
                    </div>
                <?php endif; ?>
                <div class="d-flex flex-wrap gap-2">
                    <button type="button" class="btn btn-outline-primary btn-sm" onclick="adminAction('force_open', <?= $l['id'] ?>)">🔓 Mở khóa khẩn cấp</button>
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="adminAction('reset_locker', <?= $l['id'] ?>)">🔄 Reset / Hủy đơn</button>
                </div>
            </div>
        </div>
    </div>
</div>
<?php endforeach; ?>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script src="assets/js/api.js"></script>
<script src="assets/js/admin.js"></script>
</body>
</html>
