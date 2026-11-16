// Lời gọi backend đã tách sang assets/js/api.js; hiện các thao tác vẫn chạy mô phỏng.
function adminAction(actionType, lockerId) {
    if (!confirm('Xác nhận thực hiện thao tác này cho Tủ ID ' + lockerId + '?')) return;

    // Khi backend sẵn sàng, thay mô phỏng bằng:
    // const request = actionType === 'force_open'
    //     ? SmartLockerApi.forceOpen(lockerId)
    //     : SmartLockerApi.resetLocker(lockerId);
    // request.then(data => { alert(data.message); location.reload(); })
    //     .catch(error => alert(error.message));

    alert('Mô phỏng lệnh [' + actionType + '] cho tủ ID ' + lockerId + '. Chưa thay đổi trạng thái tủ.');
}
