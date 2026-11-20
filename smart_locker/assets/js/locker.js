// Chọn tủ và thiết lập nhiệt độ thông minh (hỗ trợ cả Làm mát 2–10°C và Giữ nóng 45–65°C).
function selectLocker(element) {
    if (element.disabled) return;
    document.querySelectorAll('.locker-card').forEach(tile => {
        tile.classList.remove('selected');
        if (!tile.disabled) tile.setAttribute('aria-pressed', 'false');
    });
    element.classList.add('selected');
    element.setAttribute('aria-pressed', 'true');
    document.getElementById('selected_locker_id').value = element.dataset.id;
    document.getElementById('selected_locker_type').value = element.dataset.type;
    document.getElementById('selected-locker-label').textContent = 'Đang chọn tủ ' + element.dataset.slot.padStart(2, '0');
    document.getElementById('booking-form-card').hidden = false;
    document.getElementById('booking-prompt').hidden = true;
    const otpCard = document.getElementById('otp-result-card');
    if (otpCard) otpCard.hidden = true;
    const selected = document.querySelector('input[name="category"]:checked');
    if (selected) suggestTemp(selected.value);
}

function suggestTemp(category) {
    const type = document.getElementById('selected_locker_type')?.value;
    const slider = document.getElementById('target_temp');
    if (!slider) return;
    document.getElementById('temp-control-box').hidden = false;

    const isNormal = category === 'PARCEL';
    let suggested = 25;
    let hint = 'Bưu kiện thường: Tắt sò nhiệt để tiết kiệm điện (Smart OTP đầu 3).';

    if (category === 'DRINK') {
        suggested = type === 'NORMAL' ? 25 : 5;
        hint = type === 'NORMAL'
            ? 'Ngăn thường không hỗ trợ làm lạnh sâu.'
            : 'Đồ uống lạnh: Tự động cài 5°C, bật sò lạnh Peltier (Smart OTP đầu 1).';
    } else if (category === 'FOOD') {
        suggested = type === 'NORMAL' ? 25 : 8;
        hint = type === 'NORMAL'
            ? 'Ngăn thường bảo quản nhiệt độ phòng 25°C.'
            : 'Thực phẩm mát: Tự động cài 8°C (Smart OTP đầu 1).';
    } else if (category === 'HOT_FOOD') {
        suggested = 55;
        hint = 'Đồ ăn nóng: Tự động kích hoạt chế độ giữ ấm 55°C (Smart OTP đầu 2).';
    }

    slider.value = suggested;
    slider.disabled = isNormal || (type === 'NORMAL' && category !== 'HOT_FOOD');
    document.getElementById('temp_display').textContent = slider.value;
    document.getElementById('temp_hint').textContent = hint;
}
