// Các lời gọi API dùng chung. Giao diện hiện vẫn dùng dữ liệu mô phỏng.
window.SmartLockerApi = (() => {
    async function post(endpoint, payload) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json',
            },
            body: new URLSearchParams(payload),
        });

        let data;
        try {
            data = await response.json();
        } catch (error) {
            throw new Error('Máy chủ trả về phản hồi không hợp lệ.');
        }

        if (!response.ok || !data || data.status !== 'success') {
            const error = new Error(data && data.message ? data.message : 'Không thể thực hiện yêu cầu.');
            error.status = response.status;
            error.code = data && data.code;
            throw error;
        }

        return data;
    }

    return Object.freeze({
        createBooking(lockerId, category, targetTemp) {
            return post('api/create_booking.php', {
                locker_id: lockerId,
                category,
                target_temp: targetTemp,
            });
        },
        verifyOtp(otp) {
            return post('api/verify_otp.php', { otp });
        },
        forceOpen(lockerId) {
            return post('api/force_open.php', { locker_id: lockerId });
        },
        resetLocker(lockerId) {
            return post('api/reset_locker.php', { locker_id: lockerId });
        },
    });
})();
