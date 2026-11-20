/**
 * FILE: assets/js/api.js
 * Phụ trách: Ngọc Hiếu
 * Kiến trúc:
 *  1. Gọi các PHP REST API (api/*.php) kèm Supabase JWT Bearer Token để lưu trữ an toàn vào Supabase PostgreSQL.
 *  2. Kết nối trực tiếp EMQX MQTT over WebSockets (wss://broker.emqx.io:8084/mqtt) để đồng bộ Realtime < 100ms với mạch ESP32 trên Wokwi.
 *  3. Tự động hydrat hóa (cập nhật dữ liệu thật) lên dashboard.php, lockers.php, history.php, members.php, settings.php, support.php.
 */
window.SmartLockerAPI = (() => {
    const MQTT_BROKER_WSS = 'wss://broker.emqx.io:8084/mqtt';
    const TOPIC_PREFIX = 'uth/iot/smartlocker/nhom4';
    const TOPIC_CMD = `${TOPIC_PREFIX}/cmd`;
    const TOPIC_STATE = `${TOPIC_PREFIX}/state`;

    let mqttClient = null;
    let mqttConnected = false;
    let mockTimer = null;
    const stateListeners = new Set();

    // [VẤN ĐÁP]: Lấy JWT access_token từ phiên Supabase Auth hiện tại để gửi kèm mỗi yêu cầu tới PHP Backend.
    async function getAccessToken() {
        if (!window.SmartLockerSupabase?.isConfigured()) return null;
        const { data } = await window.SmartLockerSupabase.getClient().auth.getSession();
        return data?.session?.access_token || null;
    }

    async function request(endpoint, { method = 'GET', body = null } = {}) {
        const token = await getAccessToken();
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(endpoint, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        let payload = {};
        try { payload = await res.json(); } catch (_) { payload = { ok: false, error: 'Phản hồi không phải JSON hợp lệ.' }; }
        if (!res.ok || payload.ok === false) {
            const err = new Error(payload.error || `Lỗi API (${res.status})`);
            err.status = res.status;
            err.code = payload.code || '';
            throw err;
        }
        return payload;
    }

    // =========================================================================
    // KẾT NỐI REALTIME EMQX MQTT OVER WEBSOCKETS VỚI MẠCH WOKWI ESP32
    // =========================================================================
    function updateBanner(text, mode = 'online') {
        const el = document.getElementById('ui-conn-status');
        const dot = document.getElementById('ui-conn-dot');
        if (el) el.textContent = text;
        if (dot) {
            dot.style.background = mode === 'online' ? '#16a34a' : (mode === 'mock' ? '#d97706' : '#dc2626');
        }
    }

    // [VẤN ĐÁP]: Dùng MQTT over WSS (cổng 8084) vì trình duyệt không mở được TCP cổng 1883 thuần như ESP32.
    function connectMqtt() {
        if (mqttClient || typeof window.mqtt === 'undefined') return;
        const clientId = 'sl_web_' + Math.random().toString(16).slice(2, 10);
        mqttClient = window.mqtt.connect(MQTT_BROKER_WSS, {
            clientId,
            clean: true,
            reconnectPeriod: 3000,
        });

        mqttClient.on('connect', () => {
            mqttConnected = true;
            mqttClient.subscribe(TOPIC_STATE, { qos: 1 });
            updateBanner('Trực tuyến · Đồng bộ Supabase + MQTT Wokwi (<100ms)', 'online');
        });

        mqttClient.on('offline', () => {
            mqttConnected = false;
            updateBanner('Đang kết nối lại MQTT Broker...', 'offline');
        });

        mqttClient.on('message', (topic, message) => {
            if (topic !== TOPIC_STATE) return;
            try {
                const hwData = JSON.parse(message.toString());
                applyLiveHardwareTile(hwData);
                stateListeners.forEach(fn => fn(hwData));
            } catch (e) {
                console.warn('[MQTT JSON Parse Error]', e);
            }
        });
    }

    // [VẤN ĐÁP]: Bật qos=1 và retain=true giúp mạch ESP32 trên Wokwi nhận được lệnh ngay cả khi vừa reset lại.
    function publishHardwareCommand(cmdPayload) {
        if (!mqttClient || !mqttConnected) return false;
        mqttClient.publish(TOPIC_CMD, JSON.stringify(cmdPayload), { qos: 1, retain: true });
        return true;
    }

    function onHardwareUpdate(callback) {
        stateListeners.add(callback);
        return () => stateListeners.delete(callback);
    }

    // Cập nhật ngay 1 ô ngăn tủ khi nhận gói tin MQTT từ Wokwi mà không cần reload trang
    function applyLiveHardwareTile(hw) {
        const id = Number(hw.locker_id || 1);
        const tile = document.querySelector(`.locker-tile[data-id="${id}"]`);
        if (tile && typeof hw.current_temp !== 'undefined') {
            const tempEl = tile.querySelector('.locker-temperature');
            if (tempEl) tempEl.textContent = `${Number(hw.current_temp).toFixed(1)}°C`;
        }
        const dlgTemp = document.querySelector(`#locker-detail-${id} [data-dialog-temp]`);
        if (dlgTemp && typeof hw.current_temp !== 'undefined') {
            dlgTemp.textContent = `${Number(hw.current_temp).toFixed(1)}°C / Mục tiêu ${Number(hw.target_temp ?? 8).toFixed(1)}°C`;
        }
        if (Number(hw.wrong_attempts || 0) >= 3 || hw.state === 'LOCKOUT') {
            window.showToast?.(`CẢNH BÁO AN NINH: Nhập sai OTP 3 lần tại Tủ ${String(id).padStart(2, '0')}!`, true);
        }
    }

    // =========================================================================
    // VIRTUAL LOCKER SIMULATOR (MÔ PHỎNG MẠCH ĐỂ DEMO KHI KHÔNG BẬT WOKWI)
    // =========================================================================
    function toggleVirtualSimulator(forceFault = false) {
        if (mockTimer && !forceFault) {
            clearInterval(mockTimer);
            mockTimer = null;
            updateBanner(mqttConnected ? 'Trực tuyến · Đồng bộ Supabase + MQTT Wokwi' : 'Đã tắt giả lập', mqttConnected ? 'online' : 'offline');
            window.showToast?.('Đã tắt chế độ Giả lập Mạch (Virtual Simulator).');
            return false;
        }
        if (mockTimer) clearInterval(mockTimer);

        let simTemp = forceFault ? 22.4 : 6.2;
        updateBanner(forceFault ? 'SIMULATOR: Đang mô phỏng lỗi hở cửa / rò rỉ nhiệt!' : 'SIMULATOR: Đang giả lập cảm biến DHT22 mỗi 2 giây', 'mock');
        window.showToast?.(forceFault ? 'Đang kích hoạt kịch bản lỗi rò rỉ nhiệt Tủ 01 để kiểm thử AI!' : 'Đã bật Virtual Locker Simulator (Tủ 01 & Tủ 03).');

        const tick = async () => {
            simTemp = forceFault ? Math.min(28.0, simTemp + 0.6) : (5.0 + Math.random() * 1.4);
            const payload = {
                locker_id: 1,
                current_temp: Number(simTemp.toFixed(1)),
                target_temp: 5.0,
                humidity: 62.0,
                pwm_power: forceFault ? 100 : 35,
                door_locked: !forceFault,
                has_item: true,
                wrong_attempts: 0,
                online: true,
                state: forceFault ? 'ANOMALY' : 'STORING',
            };
            applyLiveHardwareTile(payload);
            stateListeners.forEach(fn => fn(payload));
            try {
                const res = await request('api/lockers.php', { method: 'POST', body: payload });
                if (res.ai_analysis?.has_anomaly) {
                    window.showToast?.(`[AI CẢNH BÁO TỦ 01] ${res.ai_analysis.reason}`, true);
                }
            } catch (_) {
                // Nếu chưa điền Service Key thì Simulator vẫn cập nhật mượt trên UI
            }
        };
        tick();
        mockTimer = setInterval(tick, 3000);
        return true;
    }

    // =========================================================================
    // CÁC HÀM NGHIỆP VỤ GỌI API PHP
    // =========================================================================
    const api = {
        getLockers: () => request('api/lockers.php'),
        getTelemetry: (lockerId = 1, limit = 30) => request(`api/telemetry.php?locker_id=${encodeURIComponent(lockerId)}&limit=${encodeURIComponent(limit)}`),
        syncAuth: () => request('api/auth.php', { method: 'POST' }),
        createBooking: async (data) => {
            const res = await request('api/create_booking.php', { method: 'POST', body: data });
            if (res.mqtt_command) publishHardwareCommand(res.mqtt_command);
            return res;
        },
        verifyOtp: async (otp, lockerId = 0) => {
            const res = await request('api/verify_otp.php', { method: 'POST', body: { otp, locker_id: lockerId } });
            if (res.mqtt_command) publishHardwareCommand(res.mqtt_command);
            return res;
        },
        forceOpen: async (lockerId, reason = 'Admin emergency unlock') => {
            const res = await request('api/force_open.php', { method: 'POST', body: { locker_id: lockerId, reason } });
            if (res.mqtt_command) publishHardwareCommand(res.mqtt_command);
            return res;
        },
        resetLocker: async (lockerId) => {
            const res = await request('api/reset_locker.php', { method: 'POST', body: { locker_id: lockerId } });
            if (res.mqtt_command) publishHardwareCommand(res.mqtt_command);
            return res;
        },
        setLockerTemp: async (lockerId, targetTemp) => {
            const res = await request('api/lockers.php', { method: 'PATCH', body: { locker_id: lockerId, target_temp: Number(targetTemp) } });
            publishHardwareCommand({ cmd: 'SET_TEMP', locker_id: lockerId, target_temp: Number(targetTemp), timestamp: Math.floor(Date.now() / 1000) });
            return res;
        },
        getAccount: () => request('api/account.php'),
        updateProfile: (fullName) => request('api/account.php', { method: 'POST', body: { action: 'update_profile', full_name: fullName } }),
        inviteMember: (email, role) => request('api/account.php', { method: 'POST', body: { action: 'invite_member', email, role } }),
        removeMember: (id) => request(`api/account.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
        createSupportTicket: (data) => request('api/support.php', { method: 'POST', body: data }),
        connectMqtt,
        publishHardwareCommand,
        onHardwareUpdate,
        toggleVirtualSimulator,
    };

    // =========================================================================
    // TỰ ĐỘNG GẮN NGHIỆP VỤ VÀO CÁC TRANG GIAO DIỆN HIỆN CÓ
    // =========================================================================
    function formatDateVN(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }).format(new Date(iso));
        } catch (_) { return iso; }
    }

    function statusText(st) {
        return { ACTIVE: 'Chờ nhận', COLLECTED: 'Đã nhận', CANCELLED: 'Đã hủy', AVAILABLE: 'Trống', OCCUPIED: 'Đang dùng', ERROR: 'Bảo trì' }[st] || st;
    }

    function categoryText(cat) {
        return { FOOD: 'Đồ ăn mát', HOT_FOOD: 'Đồ ăn nóng', DRINK: 'Đồ uống lạnh', PARCEL: 'Bưu kiện thường' }[cat] || cat;
    }

    function renderBookingsTableRows(tbody, bookings) {
        if (!tbody) return;
        if (!bookings.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Chưa có giao dịch thực tế nào trên Supabase.</td></tr>';
            return;
        }
        tbody.innerHTML = bookings.map(b => `
            <tr>
                <td><strong class="table-title">#SL${String(b.id).padStart(5, '0')}</strong><small>${categoryText(b.category)} · ${b.target_temp ?? 25}°C</small></td>
                <td><span class="table-locker">Tủ ${String(b.slot || b.locker_id).padStart(2, '0')}</span></td>
                <td>${b.recipient_email || ''}</td>
                <td>${formatDateVN(b.created_at)}</td>
                <td><span class="status-badge status-${String(b.status || '').toLowerCase()}"><i></i>${statusText(b.status)}</span></td>
            </tr>
        `).join('');
    }

    function updateLockerTiles(lockers, isAdmin = false) {
        lockers.forEach(l => {
            const tile = document.querySelector(`.locker-tile[data-id="${l.id}"]`);
            if (!tile) return;
            const avail = l.status === 'AVAILABLE' && Boolean(l.online);
            const hasIssue = l.status === 'ERROR' || !l.online || Boolean(l.ai_analysis?.has_anomaly);
            tile.dataset.type = l.type;
            tile.classList.remove('available', 'occupied', 'unavailable', 'has-issue');
            if (isAdmin) {
                tile.classList.add(hasIssue ? 'has-issue' : (avail ? 'available' : 'occupied'));
            } else {
                tile.classList.add(avail ? 'available' : (l.status === 'OCCUPIED' ? 'occupied' : 'unavailable'));
                tile.disabled = !avail;
                if (avail) tile.setAttribute('onclick', 'selectLocker(this)');
            }
            const tempEl = tile.querySelector('.locker-temperature');
            if (tempEl) tempEl.textContent = `${Number(l.current_temp).toFixed(1)}°C`;
            const stEl = tile.querySelector('.locker-status');
            if (stEl) stEl.textContent = statusText(l.status) + (isAdmin && hasIssue ? ' ⚠' : '');
        });
    }

    async function hydratePage() {
        connectMqtt();
        const page = document.body.dataset.activePage || '';
        const requiresAuth = document.body.dataset.requiresAuth === 'true';

        if (window.SmartLockerAuth?.ready) {
            const user = await window.SmartLockerAuth.ready;
            if (!user && requiresAuth) return;
            if (user) {
                api.syncAuth().catch(() => {});
            }
        }

        // 1. Nạp dữ liệu tủ & giao dịch cho Dashboard / Lockers / History
        if (['dashboard', 'lockers', 'history'].includes(page)) {
            try {
                const res = await api.getLockers();
                if (page === 'lockers') {
                    updateLockerTiles(res.lockers, false);
                }
                if (page === 'dashboard') {
                    document.querySelector('[data-stat="total"]')?.replaceChildren(String(res.stats.total).padStart(2, '0'));
                    document.querySelector('[data-stat="available"]')?.replaceChildren(String(res.stats.available).padStart(2, '0'));
                    document.querySelector('[data-stat="active"]')?.replaceChildren(String(res.stats.active_bookings).padStart(2, '0'));
                    document.querySelector('[data-stat="bookings"]')?.replaceChildren(String(res.bookings.length).padStart(2, '0'));
                    renderBookingsTableRows(document.querySelector('tbody[data-live-bookings]'), res.bookings.slice(0, 5));
                }
                if (page === 'history') {
                    renderBookingsTableRows(document.querySelector('tbody[data-live-bookings]'), res.bookings);
                }
            } catch (err) {
                if (err.code === 'MISSING_SERVICE_KEY') {
                    updateBanner('Chế độ giao diện mẫu · Hãy tạo file .env điền SUPABASE_SECRET_KEY (sb_secret_...) để chạy DB thật', 'mock');
                }
            }
        }

        // 2. Xử lý form Gửi hàng (lockers.php)
        const bookingForm = document.getElementById('booking-form');
        if (bookingForm) {
            bookingForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('btn-create-booking');
                const lockerId = Number(document.getElementById('selected_locker_id')?.value || 0);
                const category = bookingForm.querySelector('input[name="category"]:checked')?.value || 'PARCEL';
                const recipientEmail = document.getElementById('recipient-email')?.value.trim() || '';
                const targetTemp = Number(document.getElementById('target_temp')?.value || 25);

                if (!lockerId) return window.showToast('Vui lòng chọn một ngăn tủ trống.', true);
                if (!recipientEmail) return window.showToast('Vui lòng nhập email người nhận.', true);

                btn.disabled = true;
                try {
                    const res = await api.createBooking({
                        locker_id: lockerId,
                        category,
                        recipient_email: recipientEmail,
                        target_temp: targetTemp,
                    });
                    window.showToast(res.message);
                    const box = document.getElementById('otp-result-card');
                    if (box) {
                        box.hidden = false;
                        document.getElementById('res-shipper-otp').textContent = res.booking.shipper_otp;
                        document.getElementById('res-receiver-otp').textContent = res.booking.receiver_otp;
                        document.getElementById('res-slot-info').textContent = `Tủ ${String(res.booking.slot).padStart(2, '0')} · Mục tiêu ${res.booking.target_temp}°C`;
                    }
                    const refreshed = await api.getLockers();
                    updateLockerTiles(refreshed.lockers, false);
                } catch (err) {
                    window.showToast(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        }

        // 3. Xử lý form Nhận hàng bằng OTP (lockers.php?mode=receive)
        const otpForm = document.getElementById('receive-otp-form');
        if (otpForm) {
            otpForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('btn-verify-otp');
                const otp = document.getElementById('otp_input')?.value.trim() || '';
                btn.disabled = true;
                try {
                    const res = await api.verifyOtp(otp);
                    window.showToast(res.message);
                    const resultBox = document.getElementById('receive-result-box');
                    if (resultBox) {
                        resultBox.hidden = false;
                        resultBox.textContent = res.message;
                    }
                    otpForm.reset();
                } catch (err) {
                    window.showToast(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        }

        // 4. Xử lý trang Thành viên (members.php)
        const inviteForm = document.getElementById('invite-member-form');
        if (inviteForm) {
            const loadMembers = async () => {
                try {
                    const res = await api.getAccount();
                    const container = document.getElementById('members-list-container');
                    if (!container) return;
                    if (!res.members.length) {
                        container.innerHTML = '<div class="empty-state"><h3>Chưa có thành viên nào được mời</h3><p>Nhập email đồng nghiệp ở trên để thêm vào không gian công ty.</p></div>';
                        return;
                    }
                    container.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>` +
                        res.members.map(m => `<tr><td><strong>${m.member_email}</strong></td><td>${m.role}</td><td><span class="status-badge status-available"><i></i>${m.status}</span></td><td><button class="button button-light button-sm" data-remove-member="${m.id}">Gỡ</button></td></tr>`).join('') +
                        '</tbody></table></div>';
                    container.querySelectorAll('[data-remove-member]').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            await api.removeMember(btn.dataset.removeMember);
                            window.showToast('Đã gỡ thành viên.');
                            loadMembers();
                        });
                    });
                } catch (_) {}
            };
            loadMembers();
            inviteForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('invite-email')?.value.trim() || '';
                const role = document.getElementById('invite-role')?.value || 'STAFF';
                try {
                    const res = await api.inviteMember(email, role);
                    window.showToast(res.message);
                    inviteForm.reset();
                    loadMembers();
                } catch (err) {
                    window.showToast(err.message, true);
                }
            });
        }

        // 5. Xử lý form Hỗ trợ (support.php)
        const supportForm = document.getElementById('support-ticket-form');
        if (supportForm) {
            supportForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const res = await api.createSupportTicket({
                        subject: document.getElementById('ticket-subject')?.value.trim() || '',
                        category: document.getElementById('ticket-category')?.value || 'Khác',
                        message: document.getElementById('ticket-message')?.value.trim() || '',
                    });
                    window.showToast(res.message);
                    supportForm.reset();
                } catch (err) {
                    window.showToast(err.message, true);
                }
            });
        }

        // 6. Xử lý cập nhật hồ sơ (settings.php)
        const profileForm = document.getElementById('profile-update-form');
        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const fullName = document.getElementById('profile-name')?.value.trim() || '';
                try {
                    const res = await api.updateProfile(fullName);
                    window.showToast(res.message);
                } catch (err) {
                    window.showToast(err.message, true);
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', hydratePage);
    return Object.freeze(api);
})();
