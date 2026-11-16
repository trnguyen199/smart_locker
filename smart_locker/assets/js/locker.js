// 1. Chọn tủ trống
function selectLocker(el) {
    if (el.disabled) return;
    document.querySelectorAll('.locker-card.available').forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-pressed', 'false');
    });
    el.classList.add('selected');
    el.setAttribute('aria-pressed', 'true');

    document.getElementById('selected_locker_id').value = el.dataset.id;
    document.getElementById('selected_locker_type').value = el.dataset.type;
    document.getElementById('booking-form-card').style.display = 'block';

    const selectedCategory = document.querySelector('input[name="category"]:checked');
    if (selectedCategory) suggestTemp(selectedCategory.value);
}

// 2. Đề xuất nhiệt độ theo loại hàng
function suggestTemp(category) {
    const lockerType = document.getElementById('selected_locker_type').value;
    const tempBox = document.getElementById('temp-control-box');
    const tempSlider = document.getElementById('target_temp');
    const tempDisplay = document.getElementById('temp_display');
    const tempHint = document.getElementById('temp_hint');

    tempBox.style.display = 'block';

    if (lockerType === 'NORMAL' || category === 'PARCEL') {
        tempSlider.value = 25;
        tempSlider.disabled = true;
        tempDisplay.innerText = '25';
        tempHint.innerText = 'Ngăn thường / Hàng hóa thông thường: Bảo quản ở nhiệt độ phòng.';
    } else {
        tempSlider.disabled = false;
        if (category === 'FOOD') {
            tempSlider.value = 8;
            tempDisplay.innerText = '8';
            tempHint.innerText = 'Đề xuất 8°C để giữ độ tươi cho đồ ăn.';
        } else if (category === 'DRINK') {
            tempSlider.value = 5;
            tempDisplay.innerText = '5';
            tempHint.innerText = 'Đề xuất 5°C để làm mát nước uống.';
        }
    }
}

// Lời gọi backend đã tách sang assets/js/api.js; hiện các thao tác vẫn chạy mô phỏng.

function submitCreateBooking() {
    const lockerId = document.getElementById('selected_locker_id').value;
    const categoryEl = document.querySelector('input[name="category"]:checked');
    const targetTemp = document.getElementById('target_temp').value;

    if (!lockerId || !categoryEl) {
        alert('Vui lòng chọn ngăn tủ và loại hàng hóa!');
        return;
    }

    // Khi backend sẵn sàng, thay mô phỏng bằng:
    // SmartLockerApi.createBooking(lockerId, categoryEl.value, targetTemp)
    //     .then(data => {
    //         document.getElementById('generated_otp_text').innerText = data.otp;
    //         new bootstrap.Modal(document.getElementById('otpModal')).show();
    //     }).catch(error => alert(error.message));

    // Demo giao diện tạm thời khi chưa nối API:
    const demoOtp = Math.floor(100000 + Math.random() * 900000);
    document.getElementById('generated_otp_text').innerText = demoOtp;
    new bootstrap.Modal(document.getElementById('otpModal')).show();
}

function submitVerifyOtp() {
    const otp = document.getElementById('otp_input').value.trim();
    if (!/^[0-9]{6}$/.test(otp)) {
        alert('Vui lòng nhập đủ 6 chữ số OTP!');
        return;
    }

    // Khi backend sẵn sàng, thay mô phỏng bằng:
    // SmartLockerApi.verifyOtp(otp)
    //     .then(data => { alert(data.message); location.reload(); })
    //     .catch(error => alert(error.message));

    alert('Mô phỏng kiểm tra OTP: ' + otp + '. Chưa thực hiện mở cửa tủ.');
}
