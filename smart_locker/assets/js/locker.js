// Chọn tủ và xem thiết lập trên giao diện. Không tạo đơn hoặc xác thực OTP.
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
    const selected = document.querySelector('input[name="category"]:checked');
    if (selected) suggestTemp(selected.value);
}
function suggestTemp(category) {
    const type = document.getElementById('selected_locker_type')?.value;
    const slider = document.getElementById('target_temp');
    if (!slider) return;
    document.getElementById('temp-control-box').hidden = false;
    const normal = type === 'NORMAL' || category === 'PARCEL';
    slider.value = normal ? 25 : (category === 'DRINK' ? 5 : 8);
    slider.disabled = normal;
    document.getElementById('temp_display').textContent = slider.value;
    document.getElementById('temp_hint').textContent = 'Thiết lập minh họa trên giao diện, chưa gửi tới thiết bị.';
}