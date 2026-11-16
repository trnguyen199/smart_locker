<?php
require_once __DIR__ . '/includes/pagination.php';
$lockers = require __DIR__ . '/data/lockers.php';
$pagination = paginateItems($lockers, $_GET);
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Locker - Giao Nhận Hàng Thông Minh</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body>

<div class="container py-4" style="max-width: 720px;">
    <div class="text-center mb-4">
        <h3 class="fw-bold text-primary">📦 SMART LOCKER SYSTEM</h3>
        <p class="text-muted mb-0">Hệ thống tủ giao nhận & bảo quản nhiệt độ tự động</p>
    </div>

    <!-- Chuyển đổi 2 chức năng chính -->
    <ul class="nav nav-pills nav-fill mb-4 bg-white p-2 rounded shadow-sm" id="lockerTabs" role="tablist">
        <li class="nav-item" role="presentation">
            <button class="nav-link active fw-bold" data-bs-toggle="pill" data-bs-target="#tab-send" type="button">📤 GỬI HÀNG VÀO TỦ</button>
        </li>
        <li class="nav-item" role="presentation">
            <button class="nav-link fw-bold" data-bs-toggle="pill" data-bs-target="#tab-receive" type="button">📥 NHẬN HÀNG (NHẬP OTP)</button>
        </li>
    </ul>

    <div class="tab-content">
        <!--  TAB 1: GỬI HÀNG ==================== -->
        <div class="tab-pane fade show active" id="tab-send">
            <div class="card shadow-sm border-0 mb-3">
                <div class="card-body">
                    <h6 class="fw-bold mb-3">Bước 1: Chọn ngăn tủ đang trống</h6>
                    <p class="text-muted small mb-3">Chọn một ô tủ màu xanh đang trống để gửi hàng.</p>
                    <div class="locker-grid" id="locker-grid" role="group" aria-label="Sơ đồ ngăn tủ, 3 cột">
                        <?php if ($pagination['total'] === 0): ?>
                            <p class="locker-grid-empty text-muted mb-0">Chưa có ngăn tủ nào.</p>
                        <?php endif; ?>
                        <?php foreach ($pagination['items'] as $l): 
                            $isAvail = ($l['status'] === 'AVAILABLE');
                        ?>
                            <button type="button" class="card locker-card locker-tile <?= $isAvail ? 'available' : 'occupied' ?>"
                                 data-id="<?= $l['id'] ?>" 
                                 data-type="<?= $l['type'] ?>"
                                 aria-label="<?= htmlspecialchars($l['code'], ENT_QUOTES, 'UTF-8') ?>, <?= $isAvail ? 'đang trống' : 'đang sử dụng' ?>"
                                 <?= $isAvail ? 'aria-pressed="false"' : 'disabled' ?>
                                 onclick="<?= $isAvail ? "selectLocker(this)" : "" ?>">
                                <span class="locker-number">TỦ <?= sprintf('%02d', $l['id']) ?></span>
                                <span class="locker-type"><?= $l['type'] === 'COOL' ? 'Ngăn mát' : 'Ngăn thường' ?></span>
                                <strong class="locker-temperature"><?= $l['temp'] ?>°C</strong>
                                <span class="badge locker-status bg-<?= $isAvail ? 'success' : 'secondary' ?>">
                                    <?= $isAvail ? 'Trống' : 'Đang dùng' ?>
                                </span>
                            </button>
                        <?php endforeach; ?>
                    </div>
                    <?php require __DIR__ . '/includes/components/pagination.php'; ?>
                </div>
            </div>

            <!-- Form thiết lập hàng hóa (Hiện ra khi đã chọn tủ) -->
            <div class="card shadow-sm border-0" id="booking-form-card" style="display: none;">
                <div class="card-body">
                    <h6 class="fw-bold mb-3">Bước 2: Chọn loại hàng & Thiết lập nhiệt độ</h6>
                    <input type="hidden" id="selected_locker_id">
                    <input type="hidden" id="selected_locker_type">

                    <div class="btn-group w-100 mb-3" role="group">
                        <input type="radio" class="btn-check" name="category" id="cat_food" value="FOOD" onchange="suggestTemp('FOOD')">
                        <label class="btn btn-outline-primary" for="cat_food">🍱 Đồ ăn</label>

                        <input type="radio" class="btn-check" name="category" id="cat_drink" value="DRINK" onchange="suggestTemp('DRINK')">
                        <label class="btn btn-outline-primary" for="cat_drink">🥤 Nước uống</label>

                        <input type="radio" class="btn-check" name="category" id="cat_parcel" value="PARCEL" onchange="suggestTemp('PARCEL')">
                        <label class="btn btn-outline-primary" for="cat_parcel">📦 Hàng hóa</label>
                    </div>

                    <!-- Khu vực chỉnh nhiệt độ -->
                    <div id="temp-control-box" class="p-3 bg-light rounded mb-3" style="display: none;">
                        <div class="d-flex justify-content-between">
                            <label class="fw-bold">Nhiệt độ bảo quản đề xuất:</label>
                            <span class="badge bg-info text-dark fs-6"><span id="temp_display">8</span>°C</span>
                        </div>
                        <input type="range" class="form-range mt-2" id="target_temp" min="2" max="25" step="0.5" value="8"
                               oninput="document.getElementById('temp_display').innerText = this.value">
                        <small class="text-muted" id="temp_hint">Hệ thống tự động đề xuất mức nhiệt phù hợp.</small>
                    </div>

                    <button type="button" class="btn btn-primary w-100 py-2 fw-bold" onclick="submitCreateBooking()">
                        TẠO MÃ OTP & MỞ CỬA TỦ
                    </button>
                </div>
            </div>
        </div>

        <!-- ==================== TAB 2: NHẬN HÀNG ==================== -->
        <div class="tab-pane fade" id="tab-receive">
            <div class="card shadow-sm border-0 text-center p-4">
                <h5 class="fw-bold mb-2">Nhập mã OTP nhận hàng</h5>
                <p class="text-muted small mb-4">Nhập mã 6 chữ số được cung cấp để mở khóa ngăn tủ</p>

                <div class="mx-auto mb-4" style="max-width: 320px;">
                    <input type="text" id="otp_input" class="form-control form-control-lg otp-input" 
                           maxlength="6" placeholder="000000" inputmode="numeric">
                </div>

                <button type="button" class="btn btn-success btn-lg px-5 fw-bold" onclick="submitVerifyOtp()">
                    MỞ CỬA TỦ
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Modal hiển thị mã OTP sau khi tạo thành công -->
<div class="modal fade" id="otpModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content text-center p-4">
            <h5 class="text-success fw-bold">✅ Cửa tủ đang mở!</h5>
            <p class="text-muted">Vui lòng đặt hàng vào tủ và đóng cửa lại. Mã OTP mở tủ của bạn là:</p>
            <div class="bg-light py-3 rounded my-2">
                <span class="display-4 fw-bold text-primary" id="generated_otp_text">------</span>
            </div>
            <button type="button" class="btn btn-secondary mt-3" data-bs-dismiss="modal" onclick="location.reload()">Hoàn tất</button>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script src="assets/js/api.js"></script>
<script src="assets/js/locker.js"></script>
</body>
</html>
