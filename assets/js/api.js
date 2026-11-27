/**
 * FILE: assets/js/api.js
 * Phụ trách: Ngọc Hiếu (nhánh backend)
 * Thiết kế Zero-Touch Non-Destructive:
 *  - Không yêu cầu sửa bất kỳ file giao diện PHP/CSS/auth.js nào trên nhánh `main` của Nguyên.
 *  - Tự nạp MQTT.js (WebSockets) khi cần, kết nối PHP Backend (api/*.php) kèm Supabase Auth JWT,
 *    kích hoạt các nút/biểu mẫu đang ở chế độ xem trước và đồng bộ dữ liệu thật cho tất cả trang.
 */
window.SmartLockerAPI = (() => {
    // MQTT trình duyệt tắt mặc định: thiết bị đọc pending_cmd và gửi trạng thái qua REST API.
    const mqttConfig = window.SMART_LOCKER_MQTT || {};
    const MQTT_ENABLED = mqttConfig.enabled === true;
    const MQTT_CDN = mqttConfig.cdn || 'https://unpkg.com/mqtt@5.10.4/dist/mqtt.min.js';
    const MQTT_BROKER_WSS = mqttConfig.broker || '';
    const TOPIC_PREFIX = mqttConfig.topicPrefix || '';
    const TOPIC_CMD = `${TOPIC_PREFIX}/cmd`;
    const TOPIC_STATE = `${TOPIC_PREFIX}/state`;

    let mqttClient = null;
    let mqttConnected = false;
    let mockTimer = null;
    const stateListeners = new Set();

    // [VẤN ĐÁP]: Mã hóa HTML chống lỗ hổng XSS trước khi đưa dữ liệu DB lên giao diện.
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function loadScriptOnce(src) {
        return new Promise((resolve) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve(true);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }

    async function getAccessToken() {
        const demoToken = window.SmartLockerDemoAuth?.getToken?.();
        if (demoToken) return demoToken;
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

    // Cập nhật thanh trạng thái .environment-note có sẵn trên mọi trang của main
    function updateBanner(text, mode = 'online') {
        const note = document.querySelector('.environment-note');
        if (!note) return;
        const dot = note.querySelector('.status-dot');
        const label = note.querySelector('span:not(.status-dot)');
        if (label) label.textContent = text;
        if (dot) {
            dot.style.background = mode === 'online' ? '#16a34a' : (mode === 'mock' ? '#d97706' : '#dc2626');
        }
    }

    function applyBackendIdentity(user) {
        if (!user) return;
        const isAdmin = user.role === 'ADMIN';
        const hasAccess = Boolean(user.has_locker_access ?? isAdmin);
        document.body.dataset.accountType = isAdmin ? 'company' : 'user';
        document.body.dataset.backendRole = user.role || 'RECEIVER';
        document.body.dataset.lockerAccess = hasAccess ? 'granted' : 'denied';
        document.querySelectorAll('[data-company-only]').forEach(el => { el.hidden = !isAdmin; });
        document.querySelectorAll('[data-personal-only]').forEach(el => { el.hidden = isAdmin; });
        const companyLabel = user.company_name || (isAdmin ? 'Không gian doanh nghiệp' : 'Chưa liên kết công ty');
        document.querySelectorAll('[data-workspace-label]').forEach(el => {
            el.textContent = isAdmin ? companyLabel : 'Không gian người dùng';
        });
        document.querySelectorAll('[data-company-name]').forEach(el => {
            if (el.matches('input')) el.value = companyLabel;
            else el.textContent = companyLabel;
        });
        document.querySelectorAll('[data-workspace-crumb]').forEach(el => {
            el.textContent = isAdmin ? 'Không gian doanh nghiệp' : 'Không gian người dùng';
        });
        document.querySelectorAll('[data-account-type-label]').forEach(el => {
            el.textContent = isAdmin ? 'Doanh nghiệp (Quản trị)' : 'Người dùng';
        });
        document.querySelectorAll('[data-workspace-panel-title]').forEach(el => {
            el.textContent = isAdmin ? 'Không gian doanh nghiệp' : 'Không gian người dùng';
        });
        const roleText = isAdmin
            ? 'Quản trị viên doanh nghiệp'
            : (hasAccess
                ? (user.role === 'SHIPPER'
                    ? `Shipper · ${user.company_name || 'Doanh nghiệp'}`
                    : `Thành viên · ${user.company_name || 'Doanh nghiệp'}`)
                : 'Chưa được mời vào công ty');
        document.querySelectorAll('[data-workspace-role]').forEach(el => {
            el.textContent = roleText;
        });
        try {
            if (isAdmin && user.email) {
                localStorage.setItem('smart_locker_admin_email', String(user.email).toLowerCase());
            } else {
                localStorage.removeItem('smart_locker_admin_email');
            }
            const hint = JSON.parse(localStorage.getItem('smart_locker_session_hint') || 'null');
            if (hint) {
                hint.accountType = isAdmin ? 'company' : 'user';
                hint.hasLockerAccess = hasAccess;
                hint.roleLabel = roleText;
                if (user.company_name) hint.company = user.company_name;
                else delete hint.company;
                localStorage.setItem('smart_locker_session_hint', JSON.stringify(hint));
            }
            sessionStorage.setItem('smart_locker_auth_cache_v1', JSON.stringify({
                owner: getSessionOwnerKey(),
                user,
            }));
        } catch (_) {}
    }

    // =========================================================================
    // KẾT NỐI REALTIME EMQX MQTT OVER WEBSOCKETS VỚI TỦ MÔ PHỎNG / MẠCH ESP32
    // =========================================================================
    async function connectMqtt() {
        if (!MQTT_ENABLED || !MQTT_BROKER_WSS || !TOPIC_PREFIX) return false;
        if (mqttClient) return;
        if (typeof window.mqtt === 'undefined') {
            await loadScriptOnce(MQTT_CDN);
        }
        if (typeof window.mqtt === 'undefined') return;

        const clientId = 'sl_web_' + Math.random().toString(16).slice(2, 10);
        mqttClient = window.mqtt.connect(MQTT_BROKER_WSS, {
            clientId,
            clean: true,
            reconnectPeriod: 3000,
        });

        mqttClient.on('connect', () => {
            mqttConnected = true;
            mqttClient.subscribe(TOPIC_STATE, { qos: 1 });
            updateBanner('Trực tuyến · Đồng bộ dữ liệu + MQTT Realtime (<100ms)', 'online');
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

    function publishHardwareCommand(cmdPayload) {
        if (!MQTT_ENABLED || !mqttClient || !mqttConnected) return false;
        mqttClient.publish(TOPIC_CMD, JSON.stringify(cmdPayload), { qos: 1, retain: false });
        return true;
    }

    function onHardwareUpdate(callback) {
        stateListeners.add(callback);
        return () => stateListeners.delete(callback);
    }

    function applyLiveHardwareTile(hw) {
        const id = Number(hw.locker_id || 1);
        const tile = document.querySelector(`.locker-tile[data-id="${id}"]`);
        if (tile && typeof hw.current_temp !== 'undefined') {
            const tempEl = tile.querySelector('.locker-temperature');
            if (tempEl) tempEl.textContent = `${Number(hw.current_temp).toFixed(1)}°C`;
        }
        const dlg = document.getElementById(`locker-detail-${id}`);
        if (dlg && typeof hw.current_temp !== 'undefined') {
            const dds = dlg.querySelectorAll('.definition-list dd');
            if (dds[1]) dds[1].textContent = `${Number(hw.current_temp).toFixed(1)}°C / Mục tiêu ${Number(hw.target_temp ?? 8).toFixed(1)}°C`;
        }
        if (Number(hw.wrong_attempts || 0) >= 3 || hw.state === 'LOCKOUT') {
            window.showToast?.(`CẢNH BÁO AN NINH: Nhập sai OTP 3 lần tại Tủ ${String(id).padStart(2, '0')}!`, true);
        }
    }

    // =========================================================================
    // VIRTUAL LOCKER SIMULATOR (MÔ PHỎNG MẠCH ĐỂ TEST & DEMO ĐỘC LẬP)
    // =========================================================================
    function toggleVirtualSimulator(forceFault = false) {
        if (mockTimer && !forceFault) {
            clearInterval(mockTimer);
            mockTimer = null;
            updateBanner(mqttConnected ? 'Trực tuyến · Đồng bộ dữ liệu + MQTT Realtime' : 'Đã tắt giả lập', mqttConnected ? 'online' : 'offline');
            window.showToast?.('Đã tắt chế độ Giả lập Mạch (Virtual Simulator).');
            return false;
        }
        if (mockTimer) clearInterval(mockTimer);

        let simTemp = forceFault ? 22.4 : 6.2;
        updateBanner(forceFault ? 'SIMULATOR: Đang mô phỏng lỗi hở cửa / rò rỉ nhiệt!' : 'SIMULATOR: Đang giả lập cảm biến DHT22 mỗi 3 giây', 'mock');
        window.showToast?.(forceFault ? 'Đang kích hoạt kịch bản lỗi rò rỉ nhiệt Tủ 01 để kiểm thử AI!' : 'Đã bật Virtual Locker Simulator (Tủ 01).');

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
            } catch (_) {}
        };
        tick();
        mockTimer = setInterval(tick, 3000);
        return true;
    }

    // =========================================================================
    // ĐỊNH DẠNG & HIỂN THỊ DÙNG CHUNG
    // =========================================================================
    function formatDateVN(iso) {
        if (!iso) return '—';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            }).format(new Date(iso));
        } catch (_) { return String(iso); }
    }

    function statusText(st) {
        return {
            ACTIVE: 'Chờ nhận',
            COLLECTED: 'Đã nhận',
            CANCELLED: 'Đã hủy',
            EXPIRED: 'Quá hạn',
            AVAILABLE: 'Trống',
            WAITING_DROP: 'Chờ bỏ hàng',
            OPEN: 'Đang mở cửa',
            OCCUPIED: 'Đang dùng',
            LOCKOUT: 'Khóa an ninh',
            ERROR: 'Bảo trì',
        }[st] || String(st || '');
    }

    function statusBadgeClass(st) {
        const s = String(st || '').toLowerCase();
        if (['available', 'collected', 'closed'].includes(s)) return 'status-available';
        if (['error', 'cancelled', 'expired', 'lockout'].includes(s)) return 'status-error';
        return 'status-active';
    }

    function categoryText(cat) {
        return {
            FOOD: 'Đồ ăn mát',
            HOT_FOOD: 'Đồ ăn nóng',
            DRINK: 'Đồ uống lạnh',
            PARCEL: 'Bưu kiện thường',
        }[cat] || String(cat || '');
    }

    function renderBookingsTableRows(tbody, bookings) {
        if (!tbody) return;
        if (!bookings.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Chưa có giao dịch phù hợp.</td></tr>';
            return;
        }
        tbody.innerHTML = bookings.map(b => `
            <tr>
                <td><strong class="table-title">#SL${String(b.id).padStart(5, '0')}</strong><small>${escapeHtml(categoryText(b.category))} · ${escapeHtml(b.target_temp ?? 25)}°C</small></td>
                <td><span class="table-locker">Tủ ${String(b.slot || b.locker_id).padStart(2, '0')}</span></td>
                <td>${escapeHtml(b.recipient_email || '')}</td>
                <td>${escapeHtml(formatDateVN(b.created_at))}</td>
                <td><span class="status-badge ${statusBadgeClass(b.status)}"><i></i>${escapeHtml(statusText(b.status))}</span></td>
            </tr>
        `).join('');
    }

    function updateLockerTiles(lockers, isAdmin = false) {
        lockers.forEach(l => {
            const tile = document.querySelector(`.locker-tile[data-id="${l.id}"]`);
            if (!tile) return;
            const avail = l.status === 'AVAILABLE' && Boolean(l.online);
            const hasIssue = ['ERROR', 'LOCKOUT'].includes(l.status) || !l.online || Boolean(l.ai_analysis?.has_anomaly);
            tile.dataset.type = l.type;
            tile.classList.remove('available', 'occupied', 'unavailable', 'has-issue');
            if (isAdmin) {
                tile.classList.add(hasIssue ? 'has-issue' : (avail ? 'available' : 'occupied'));
            } else {
                tile.classList.add(avail ? 'available' : (['OCCUPIED', 'WAITING_DROP', 'OPEN'].includes(l.status) ? 'occupied' : 'unavailable'));
                tile.disabled = !avail;
                if (avail) tile.setAttribute('onclick', 'selectLocker(this)');
            }
            const tempEl = tile.querySelector('.locker-temperature');
            if (tempEl) tempEl.textContent = `${Number(l.current_temp).toFixed(1)}°C`;
            const stEl = tile.querySelector('.locker-status');
            if (stEl) stEl.textContent = statusText(l.status) + (isAdmin && hasIssue ? ' ⚠' : '');
        });
    }

    function renderDashboardWeeklyChart(bookings) {
        const chartEl = document.querySelector('.activity-chart');
        if (!chartEl) return;
        const days = [];
        const dayMap = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            const item = { key, label, count: 0 };
            days.push(item);
            dayMap[key] = item;
        }
        bookings.forEach(b => {
            if (!b.created_at) return;
            const d = new Date(b.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (dayMap[key]) dayMap[key].count++;
        });
        const maxCount = Math.max(1, ...days.map(d => d.count));
        chartEl.innerHTML = days.map(d => {
            const pct = Math.max(4, Math.round((d.count / maxCount) * 100));
            return `<div class="chart-column"><b>${d.count}</b><div class="chart-bar" style="height:${pct}%"></div><small>${escapeHtml(d.label)}</small></div>`;
        }).join('');
        const foot = document.querySelector('.chart-foot');
        if (foot) {
            foot.innerHTML = `<span class="status-dot"></span>Đã đồng bộ ${bookings.length} giao dịch thực tế`;
        }
    }

    // Thay thế sạch listener [data-preview-form] của app.js mà không sửa app.js
    function detachPreviewForm(form) {
        if (!form) return null;
        form.removeAttribute('data-preview-form');
        const clone = form.cloneNode(true);
        form.parentNode.replaceChild(clone, form);
        const btn = clone.querySelector('button');
        if (btn) {
            btn.disabled = false;
            btn.type = 'submit';
            btn.removeAttribute('title');
        }
        const note = clone.querySelector('.preview-note');
        if (note) note.textContent = 'Đã kết nối trực tiếp với hệ thống & MQTT Realtime.';
        return clone;
    }

    // =========================================================================
    // API PUBLIC METHODS
    // =========================================================================
    const CACHE_KEY = 'smart_locker_cache_v1';

    function getSessionOwnerKey() {
        try {
            const demo = window.SmartLockerDemoAuth?.getToken?.();
            if (demo) return demo;
            const hint = JSON.parse(localStorage.getItem('smart_locker_session_hint') || 'null');
            return hint?.email || '';
        } catch (_) { return ''; }
    }

    function getCachedLockers() {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.data || parsed.owner !== getSessionOwnerKey()) return null;
            if (Date.now() - Number(parsed.ts || 0) > 120_000) return null;
            return parsed.data;
        } catch (_) { return null; }
    }

    function saveCachedLockers(data) {
        try {
            if (!data || !data.ok) return;
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                owner: getSessionOwnerKey(),
                ts: Date.now(),
                data,
            }));
        } catch (_) {}
    }

    const api = {
        escapeHtml,
        loadScriptOnce,
        statusText,
        statusBadgeClass,
        categoryText,
        formatDateVN,
        renderBookingsTableRows,
        updateLockerTiles,
        getCachedLockers,
        getLockers: async () => {
            const data = await request('api/lockers.php');
            saveCachedLockers(data);
            return data;
        },
        getHardwareInfo: () => request('api.php?action=hardware_info'),
        getTelemetry: (lockerId = 1, limit = 30) => request(`api/telemetry.php?locker_id=${encodeURIComponent(lockerId)}&limit=${encodeURIComponent(limit)}`),
        syncAuth: () => request('api/auth.php', { method: 'POST' }),
        createBooking: async (data) => {
            return request('api/create_booking.php', { method: 'POST', body: data });
        },
        verifyOtp: async (otp, lockerId = 0) => {
            return request('api/verify_otp.php', { method: 'POST', body: { otp, locker_id: Number(lockerId) || 0 } });
        },
        forceOpen: async (lockerId, reason = 'Admin emergency unlock') => {
            return request('api/force_open.php', { method: 'POST', body: { locker_id: lockerId, reason } });
        },
        resetLocker: async (lockerId) => {
            return request('api/reset_locker.php', { method: 'POST', body: { locker_id: lockerId } });
        },
        setLockerTemp: async (lockerId, targetTemp) => {
            return request('api/lockers.php', { method: 'PATCH', body: { locker_id: lockerId, target_temp: Number(targetTemp) } });
        },
        getAccount: () => request('api/account.php'),
        updateProfile: async (fullName) => {
            if (window.SmartLockerSupabase?.isConfigured()) {
                await window.SmartLockerSupabase.getClient().auth.updateUser({ data: { full_name: fullName } });
            }
            const res = await request('api/account.php', { method: 'POST', body: { action: 'update_profile', full_name: fullName } });
            document.querySelectorAll('[data-user-name]').forEach(el => {
                if (el.matches('input')) el.value = fullName; else el.textContent = fullName;
            });
            return res;
        },
        inviteMember: (email, role) => request('api/account.php', { method: 'POST', body: { action: 'invite_member', email, role } }),
        updateMemberRole: (id, role) => request('api/account.php', { method: 'PATCH', body: { id: Number(id), role } }),
        removeMember: (id) => request(`api/account.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
        createSupportTicket: (data) => request('api/support.php', { method: 'POST', body: data }),
        connectMqtt,
        publishHardwareCommand,
        onHardwareUpdate,
        toggleVirtualSimulator,
    };

    // =========================================================================
    // ZERO-TOUCH HYDRATION CHO TỪNG TRANG TRÊN NHÁNH `main` KHÔNG SỬA HTML
    // =========================================================================
    function wireLockersSendPage() {
        const card = document.getElementById('booking-form-card');
        if (!card) return;
        const oldForm = card.querySelector('form');
        const form = detachPreviewForm(oldForm);
        if (!form) return;

        // Nâng cấp danh mục 2x2 thêm HOT_FOOD (55°C) + dải nhiệt 2–65°C + chọn thời hạn OTP
        const catGrid = form.querySelector('.category-grid');
        if (catGrid && !catGrid.querySelector('input[value="HOT_FOOD"]')) {
            catGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            const hotLabel = document.createElement('label');
            hotLabel.innerHTML = '<input type="radio" name="category" value="HOT_FOOD"><span>Đồ ăn nóng (55°C)</span>';
            catGrid.appendChild(hotLabel);
        }

        const slider = form.querySelector('#target_temp');
        if (slider) slider.max = '65';

        // Gắn bộ gợi ý nhiệt độ cho cả 9 ngăn (mặc định thường 25°C, đều hỗ trợ nóng/lạnh)
        window.suggestTemp = (category) => {
            const sl = document.getElementById('target_temp');
            if (!sl) return;
            document.getElementById('temp-control-box').hidden = false;
            let suggested = 25;
            let hint = 'Mặc định ngăn thường 25°C · có thể kéo thanh trượt để chỉnh nóng/lạnh (Smart OTP đầu 3).';
            if (category === 'DRINK') {
                suggested = 5;
                hint = 'Đồ uống lạnh: Gợi ý 5°C (Smart OTP đầu 1).';
            } else if (category === 'FOOD') {
                suggested = 8;
                hint = 'Đồ ăn mát: Gợi ý 8°C (Smart OTP đầu 1).';
            } else if (category === 'HOT_FOOD') {
                suggested = 55;
                hint = 'Đồ ăn nóng: Gợi ý giữ ấm 55°C (Smart OTP đầu 2).';
            }
            sl.value = String(suggested);
            sl.disabled = false;
            document.getElementById('temp_display').textContent = sl.value;
            document.getElementById('temp_hint').textContent = hint;
        };
        form.querySelectorAll('input[name="category"]').forEach(radio => {
            radio.removeAttribute('onchange');
            radio.addEventListener('change', () => window.suggestTemp(radio.value));
        });
        if (typeof window.selectLocker === 'function') {
            const origSelect = window.selectLocker;
            window.selectLocker = (el) => {
                origSelect(el);
                const cardEl = document.getElementById('otp-result-card');
                if (cardEl) cardEl.hidden = true;
            };
        }

        // Thêm bộ chọn thời hạn OTP (có mức 2 phút để demo ca quá hạn BA)
        const tempBox = form.querySelector('#temp-control-box');
        if (tempBox && !form.querySelector('#otp-expiry')) {
            const expField = document.createElement('div');
            expField.className = 'field';
            expField.innerHTML = '<label for="otp-expiry">Thời hạn mã OTP</label><select id="otp-expiry" name="expires_in_minutes"><option value="1440" selected>24 giờ (Tiêu chuẩn)</option><option value="720">12 giờ</option><option value="240">4 giờ (Đồ nóng/lạnh)</option><option value="2">2 phút (Demo quá hạn OTP)</option></select>';
            tempBox.parentNode.insertBefore(expField, tempBox);
        }

        // Hộp hiển thị mã Smart OTP sau khi tạo đơn
        let otpBox = document.getElementById('otp-result-card');
        if (!otpBox) {
            otpBox = document.createElement('div');
            otpBox.id = 'otp-result-card';
            otpBox.hidden = true;
            otpBox.style.cssText = 'margin-top:16px;padding:14px;border-radius:12px;background:#f0faf4;border:1px solid #a3cfbb';
            otpBox.innerHTML = '<strong style="display:block;margin-bottom:6px;color:#163d35">Đã cấp mã Smart OTP thành công!</strong><small id="res-slot-info" style="display:block;margin-bottom:8px;color:#334155"></small><div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>OTP Shipper: <strong id="res-shipper-otp">------</strong></span><span>OTP Nhận: <strong id="res-receiver-otp">------</strong></span></div>';
            card.appendChild(otpBox);
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const lockerId = Number(document.getElementById('selected_locker_id')?.value || 0);
            const category = form.querySelector('input[name="category"]:checked')?.value || 'PARCEL';
            const recipientEmail = document.getElementById('recipient-email')?.value.trim() || '';
            const targetTemp = Number(document.getElementById('target_temp')?.value || 25);
            const expiresInMinutes = Number(document.getElementById('otp-expiry')?.value || 1440);

            if (!lockerId) return window.showToast?.('Vui lòng chọn một ngăn tủ trống.', true);
            if (!recipientEmail) return window.showToast?.('Vui lòng nhập email người nhận.', true);

            if (btn) btn.disabled = true;
            try {
                const res = await api.createBooking({
                    locker_id: lockerId,
                    category,
                    recipient_email: recipientEmail,
                    target_temp: targetTemp,
                    expires_in_minutes: expiresInMinutes,
                });
                window.showToast?.(res.message);
                otpBox.hidden = false;
                document.getElementById('res-shipper-otp').textContent = res.booking.shipper_otp;
                document.getElementById('res-receiver-otp').textContent = res.booking.receiver_otp;
                document.getElementById('res-slot-info').textContent = `Tủ ${String(res.booking.slot).padStart(2, '0')} · Mục tiêu ${res.booking.target_temp}°C · Hết hạn: ${formatDateVN(res.booking.expires_at)}`;
                const refreshed = await api.getLockers();
                updateLockerTiles(refreshed.lockers, false);
            } catch (err) {
                window.showToast?.(err.message, true);
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    function wireLockersReceivePage() {
        const panel = document.querySelector('.receive-panel');
        if (!panel) return;
        const form = detachPreviewForm(panel.querySelector('form'));
        if (!form) return;

        // Thêm bộ chọn ngăn tủ (tùy chọn) để test Anti-Brute-Force theo từng ngăn
        const otpField = form.querySelector('.field');
        if (otpField && !form.querySelector('#receive-locker-id')) {
            const selField = document.createElement('div');
            selField.className = 'field';
            selField.style.cssText = 'max-width:300px;margin:0 auto 14px;text-align:left';
            let opts = '<option value="0">Tự động tìm ngăn tủ theo mã OTP</option>';
            for (let i = 1; i <= 9; i++) opts += `<option value="${i}">Tủ ${String(i).padStart(2, '0')}</option>`;
            selField.innerHTML = `<label for="receive-locker-id">Chọn ngăn tủ (không bắt buộc)</label><select id="receive-locker-id">${opts}</select>`;
            form.insertBefore(selField, otpField);
        }

        const resultBox = document.createElement('div');
        resultBox.hidden = true;
        resultBox.style.cssText = 'margin-top:16px;padding:12px;border-radius:10px;background:#f0faf4;border:1px solid #a3cfbb;color:#163d35;font-weight:600';
        form.insertAdjacentElement('afterend', resultBox);

        const prevNote = panel.querySelector('.preview-note');
        if (prevNote) prevNote.textContent = 'Nhập mã OTP 6 chữ số để mở chốt cửa ngăn tủ theo thời gian thực.';

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const otp = document.getElementById('otp_input')?.value.trim() || '';
            const lockerId = Number(document.getElementById('receive-locker-id')?.value || 0);
            if (btn) btn.disabled = true;
            try {
                const res = await api.verifyOtp(otp, lockerId);
                window.showToast?.(res.message);
                resultBox.hidden = false;
                resultBox.textContent = res.message;
                form.reset();
            } catch (err) {
                window.showToast?.(err.message, true);
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    function wireMembersPage() {
        const inviteBox = document.querySelector('.invite-box');
        if (!inviteBox) return;
        const emailInput = document.getElementById('invite-email');
        const inviteBtn = inviteBox.querySelector('button');
        const listPanel = document.querySelector('[data-company-only] .panel');

        if (emailInput && !document.getElementById('invite-role')) {
            const roleField = document.createElement('div');
            roleField.className = 'field';
            roleField.innerHTML = '<label for="invite-role">Vai trò phân quyền</label><select id="invite-role"><option value="STAFF">Nhân viên (Nhận / Gửi hàng)</option><option value="SHIPPER">Shipper nội bộ</option><option value="ADMIN">Quản trị viên tủ</option></select>';
            emailInput.closest('.field').insertAdjacentElement('afterend', roleField);
        }

        const loadMembers = async () => {
            try {
                const res = await api.getAccount();
                if (!listPanel) return;
                const oldBody = listPanel.querySelector('.empty-state, .table-wrap');
                const wrap = document.createElement('div');
                if (!res.members.length) {
                    wrap.className = 'empty-state';
                    wrap.innerHTML = '<h3>Chưa có thành viên nào được mời</h3><p>Nhập email đồng nghiệp ở trên để gán vai trò vận hành.</p>';
                } else {
                    wrap.className = 'table-wrap';
                    wrap.innerHTML = `<table><thead><tr><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>` +
                        res.members.map(m => `<tr><td><strong>${escapeHtml(m.member_email)}</strong></td><td>${escapeHtml(m.role)}</td><td><span class="status-badge status-available"><i></i>${escapeHtml(m.status)}</span></td><td><button class="button button-light button-sm" data-remove-member="${Number(m.id)}">Gỡ</button></td></tr>`).join('') +
                        '</tbody></table>';
                    wrap.querySelectorAll('[data-remove-member]').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            await api.removeMember(btn.dataset.removeMember);
                            window.showToast?.('Đã gỡ thành viên khỏi công ty.');
                            loadMembers();
                        });
                    });
                }
                if (oldBody) oldBody.replaceWith(wrap); else listPanel.appendChild(wrap);
            } catch (_) {}
        };

        if (inviteBtn) {
            inviteBtn.disabled = false;
            inviteBtn.addEventListener('click', async () => {
                const email = emailInput?.value.trim() || '';
                const role = document.getElementById('invite-role')?.value || 'STAFF';
                if (!email) return window.showToast?.('Vui lòng nhập email đồng nghiệp.', true);
                inviteBtn.disabled = true;
                try {
                    const res = await api.inviteMember(email, role);
                    window.showToast?.(res.message);
                    if (emailInput) emailInput.value = '';
                    loadMembers();
                } catch (err) {
                    window.showToast?.(err.message, true);
                } finally {
                    inviteBtn.disabled = false;
                }
            });
        }
        loadMembers();
    }

    function wireSettingsPage() {
        const nameInput = document.getElementById('profile-name');
        if (!nameInput) return;
        nameInput.readOnly = false;
        const panelBody = nameInput.closest('.panel-body');
        const helper = panelBody?.querySelector('.helper-copy');
        if (helper && !panelBody.querySelector('#btn-save-profile')) {
            const btn = document.createElement('button');
            btn.id = 'btn-save-profile';
            btn.type = 'button';
            btn.className = 'button button-dark button-sm';
            btn.textContent = 'Lưu thay đổi hồ sơ';
            btn.addEventListener('click', async () => {
                const val = nameInput.value.trim();
                if (!val) return window.showToast?.('Họ và tên không được để trống.', true);
                btn.disabled = true;
                try {
                    const res = await api.updateProfile(val);
                    window.showToast?.(res.message);
                } catch (err) {
                    window.showToast?.(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
            helper.replaceWith(btn);
        }
    }

    function wireSupportPage() {
        const aside = document.getElementById('new-ticket');
        if (!aside) return;
        const form = detachPreviewForm(aside.querySelector('form'));
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;
            try {
                const res = await api.createSupportTicket({
                    subject: document.getElementById('ticket-subject')?.value.trim() || '',
                    category: document.getElementById('ticket-category')?.value || 'Khác',
                    message: document.getElementById('ticket-message')?.value.trim() || '',
                });
                window.showToast?.(res.message);
                form.reset();
            } catch (err) {
                window.showToast?.(err.message, true);
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    let seenEventKeys = null;

    function formatMemberEventLabel(ev) {
        const slot = ev.locker_id ? `Tủ ${String(ev.locker_id).padStart(2, '0')}` : 'Hệ thống';
        const meta = ev.metadata || {};
        switch (ev.action) {
            case 'DOOR_CLOSED':
                return meta.next_status === 'OCCUPIED'
                    ? `${slot}: Đã đóng cửa — Hàng đã được bỏ vào tủ (${meta.target_temp ?? ''}°C)`
                    : (meta.next_status === 'AVAILABLE'
                        ? `${slot}: Đã đóng cửa — Đã lấy hàng, tủ trở về Trống`
                        : `${slot}: Đã đóng cửa`);
            case 'DOOR_OPENED':
                return `${slot}: Cửa vừa mở`;
            case 'CREATE_BOOKING':
                return `${slot}: Có đơn mới cho ${meta.recipient_email || 'người nhận'}`;
            case 'VERIFY_SHIPPER_OTP':
                return `${slot}: Shipper đã xác thực OTP mở cửa bỏ hàng`;
            case 'VERIFY_RECEIVER_OTP':
                return `${slot}: Người nhận đã xác thực OTP mở cửa lấy hàng`;
            case 'FORCE_OPEN':
                return `${slot}: Quản trị viên đã mở khóa khẩn cấp`;
            case 'RESET_LOCKER':
                return `${slot}: Quản trị viên đã đặt lại tủ`;
            default:
                return `${slot}: ${ev.action}`;
        }
    }

    function notifyMemberChanges(res) {
        const events = Array.isArray(res.member_events) ? res.member_events : [];
        const keyOf = (ev) => `${ev.id ?? ''}:${ev.action}:${ev.locker_id ?? ''}:${ev.created_at ?? ''}`;
        if (seenEventKeys === null) {
            seenEventKeys = new Set(events.map(keyOf));
            return;
        }
        const fresh = events.filter(ev => !seenEventKeys.has(keyOf(ev)));
        events.forEach(ev => seenEventKeys.add(keyOf(ev)));
        fresh.slice(0, 2).reverse().forEach(ev => {
            if (['DOOR_CLOSED', 'VERIFY_SHIPPER_OTP', 'VERIFY_RECEIVER_OTP', 'CREATE_BOOKING', 'FORCE_OPEN'].includes(ev.action)) {
                window.showToast?.(formatMemberEventLabel(ev));
            }
        });
    }

    function renderMemberSyncPanel(res) {
        if (document.body.dataset.activePage !== 'lockers') return;
        const main = document.getElementById('main-content');
        if (!main) return;
        let panel = document.getElementById('member-sync-panel');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'member-sync-panel';
            panel.className = 'panel';
            panel.style.marginTop = '22px';
            const simFrameSection = main.querySelector('iframe')?.closest('section.panel');
            if (simFrameSection) simFrameSection.insertAdjacentElement('beforebegin', panel);
            else main.appendChild(panel);
        }

        const lockerById = new Map((res.lockers || []).map(l => [Number(l.id), l]));
        const activeBookings = (res.bookings || []).filter(b => b.status === 'ACTIVE');
        const events = (res.member_events || []).slice(0, 5);

        const bookingsHtml = activeBookings.length
            ? activeBookings.map(b => {
                const l = lockerById.get(Number(b.locker_id));
                const doorText = l ? (l.door_locked ? 'Cửa đang đóng' : 'Cửa đang mở') : '—';
                const itemText = l?.has_item ? 'Đã bỏ hàng vào tủ' : 'Chưa có hàng';
                return `<tr>
                    <td><strong class="table-title">#SL${String(b.id).padStart(5, '0')}</strong><small>${escapeHtml(categoryText(b.category))} · ${escapeHtml(b.target_temp)}°C</small></td>
                    <td><span class="table-locker">Tủ ${String(b.slot || b.locker_id).padStart(2, '0')}</span></td>
                    <td>${escapeHtml(b.sender_email || '')} → ${escapeHtml(b.recipient_email || '')}</td>
                    <td><strong>${escapeHtml(doorText)}</strong><small style="display:block;color:var(--muted)">${escapeHtml(itemText)} · ${l ? Number(l.current_temp).toFixed(1) + '°C' : ''}</small></td>
                    <td><span class="status-badge ${statusBadgeClass(l?.status || b.status)}"><i></i>${escapeHtml(statusText(l?.status || b.status))}</span></td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted)">Chưa có đơn hàng đang mở liên quan tới tài khoản của bạn.</td></tr>';

        const eventsHtml = events.length
            ? events.map(ev => `<li style="padding:6px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;font-size:12.5px"><span>${escapeHtml(formatMemberEventLabel(ev))}</span><small style="color:var(--muted);white-space:nowrap">${escapeHtml(formatDateVN(ev.created_at))}</small></li>`).join('')
            : '<li style="color:var(--muted);font-size:12.5px">Chưa có sự kiện đồng bộ mới.</li>';

        panel.innerHTML = `
            <div class="panel-head" style="flex-wrap:wrap;gap:10px">
                <div>
                    <h2>Đồng bộ đơn hàng &amp; Trạng thái cửa tủ (${escapeHtml(res.user_role || 'USER')})</h2>
                    <p>Tự động cập nhật mỗi 2.5 giây khi mô phỏng, mạch Wokwi hoặc thành viên khác đóng/mở cửa tủ.</p>
                </div>
                <span class="status-badge status-available"><i></i>Live Sync (${activeBookings.length} đơn đang chạy)</span>
            </div>
            <div class="panel-body" style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px;align-items:start">
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Đơn hàng</th><th>Ngăn tủ</th><th>Người gửi → Người nhận</th><th>Cửa &amp; Hàng hóa</th><th>Trạng thái</th></tr></thead>
                        <tbody>${bookingsHtml}</tbody>
                    </table>
                </div>
                <div style="background:#f8fbf9;border:1px solid var(--line);border-radius:12px;padding:12px 14px">
                    <strong style="display:block;font-size:12px;margin-bottom:8px;color:#163d35">Hoạt động đóng/mở tủ liên quan</strong>
                    <ul style="list-style:none;margin:0;padding:0">${eventsHtml}</ul>
                </div>
            </div>
        `;
    }

    function renderMemberSyncSkeleton() {
        if (document.body.dataset.activePage !== 'lockers') return;
        const main = document.getElementById('main-content');
        if (!main || document.getElementById('member-sync-panel')) return;
        const panel = document.createElement('section');
        panel.id = 'member-sync-panel';
        panel.className = 'panel';
        panel.style.marginTop = '22px';
        const simFrameSection = main.querySelector('iframe')?.closest('section.panel');
        if (simFrameSection) simFrameSection.insertAdjacentElement('beforebegin', panel);
        else main.appendChild(panel);
        panel.innerHTML = `
            <div class="panel-head">
                <div>
                    <h2>Đồng bộ đơn hàng &amp; Trạng thái cửa tủ</h2>
                    <p>Đang đồng bộ dữ liệu thực tế…</p>
                </div>
                <span class="sl-skel" style="width:120px;height:24px">&nbsp;</span>
            </div>
            <div class="panel-body" style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px">
                <div style="display:flex;flex-direction:column;gap:10px">
                    <span class="sl-skel" style="width:100%;height:38px">&nbsp;</span>
                    <span class="sl-skel" style="width:100%;height:38px">&nbsp;</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:10px">
                    <span class="sl-skel" style="width:100%;height:26px">&nbsp;</span>
                    <span class="sl-skel" style="width:100%;height:26px">&nbsp;</span>
                </div>
            </div>
        `;
    }

    function setLockerAccessDeniedUi(page, denied, email = '') {
        const wasDenied = document.body.dataset.lockerAccess === 'denied';
        document.body.dataset.lockerAccess = denied ? 'denied' : 'granted';
        const main = document.getElementById('main-content');
        if (!main) return;
        const existing = document.getElementById('locker-access-required');
        if (!denied) {
            if (existing) existing.remove();
            if (wasDenied) {
                api.syncAuth().then(s => s?.user && applyBackendIdentity(s.user)).catch(() => {});
            }
            return;
        }
        if (page === 'lockers' && !existing) {
            const safeEmail = email ? ` (<strong>${escapeHtml(email)}</strong>)` : '';
            const box = document.createElement('section');
            box.id = 'locker-access-required';
            box.className = 'panel permission-denied empty-state';
            box.style.margin = '28px auto';
            box.innerHTML = `
                <h3>Tài khoản chưa được mời sử dụng hệ thống tủ</h3>
                <p>Hệ thống tủ thông minh chỉ hiển thị với tài khoản công ty và các tài khoản nhân viên đã được Quản trị doanh nghiệp mời qua email${safeEmail} trong mục <strong>Thành viên &amp; phân quyền</strong>.</p>
                <div class="hero-actions" style="justify-content:center;margin-bottom:0">
                    <button class="button button-dark button-sm" type="button" id="btn-recheck-invite">Kiểm tra lại lời mời</button>
                    <a class="button button-light button-sm" href="settings.php">Tài khoản của tôi</a>
                </div>
            `;
            main.appendChild(box);
            box.querySelector('#btn-recheck-invite')?.addEventListener('click', async () => {
                try {
                    const [authState, lockersRes] = await Promise.all([api.syncAuth(), api.getLockers()]);
                    applyBackendIdentity(authState.user);
                    applyPageData(page, lockersRes);
                    if (lockersRes.has_locker_access) {
                        window.showToast?.('Đã xác nhận lời mời! Hệ thống tủ đã được mở.');
                    } else {
                        window.showToast?.('Tài khoản vẫn chưa được mời vào công ty.', true);
                    }
                } catch (err) {
                    window.showToast?.(err.message || 'Không kiểm tra được quyền truy cập.', true);
                }
            });
        }
    }

    function applyPageData(page, res, { fromCache = false } = {}) {
        document.body.classList.remove('data-loading');
        const hasAccess = res.has_locker_access !== false;
        const userEmail = (() => {
            try { return JSON.parse(localStorage.getItem('smart_locker_session_hint') || 'null')?.email || ''; } catch (_) { return ''; }
        })();
        setLockerAccessDeniedUi(page, !hasAccess, userEmail);

        updateBanner(
            !hasAccess
                ? 'Chưa được mời vào công ty · Chỉ tài khoản công ty / thành viên được mời mới truy cập tủ'
                : 'Trực tuyến · Đồng bộ thời gian thực',
            hasAccess ? 'online' : 'offline'
        );
        if (!fromCache && hasAccess) notifyMemberChanges(res);

        if (page === 'lockers') {
            if (!hasAccess) return;
            updateLockerTiles(res.lockers, false);
            renderMemberSyncPanel(res);
        }
        if (page === 'dashboard') {
            const vals = document.querySelectorAll('.stats-grid .stat-value');
            if (vals[0]) vals[0].textContent = String(res.stats.total).padStart(2, '0');
            if (vals[1]) vals[1].textContent = String(res.stats.available).padStart(2, '0');
            if (vals[2]) vals[2].textContent = String(res.stats.active_bookings).padStart(2, '0');
            if (vals[3]) vals[3].textContent = String(res.bookings.length).padStart(2, '0');
            renderDashboardWeeklyChart(res.bookings);
            renderBookingsTableRows(document.querySelector('table tbody'), res.bookings.slice(0, 5));
        }
        if (page === 'history') {
            const statusSelect = document.querySelector('form.filter-bar select[name="status"]');
            if (statusSelect && !statusSelect.querySelector('option[value="EXPIRED"]')) {
                const opt = document.createElement('option');
                opt.value = 'EXPIRED';
                opt.textContent = 'Quá hạn';
                statusSelect.appendChild(opt);
            }
            const params = new URLSearchParams(location.search);
            const qRaw = (params.get('q') || '').trim().replace(/^#/, '').toLowerCase();
            const statusFilter = (params.get('status') || '').trim().toUpperCase();
            if (statusSelect && statusFilter) statusSelect.value = statusFilter;

            const allB = res.bookings || [];
            const filtered = allB.filter(b => {
                const matchStatus = !statusFilter || String(b.status).toUpperCase() === statusFilter;
                const hay = `sl${String(b.id).padStart(5, '0')} ${b.recipient_email || ''} ${b.sender_email || ''} ${b.sender_name || ''} tủ ${String(b.slot || b.locker_id).padStart(2, '0')}`.toLowerCase();
                return matchStatus && (!qRaw || hay.includes(qRaw));
            });

            const vals = document.querySelectorAll('.stats-grid .stat-value');
            if (vals[0]) vals[0].textContent = String(allB.length);
            if (vals[1]) vals[1].textContent = String(allB.filter(b => b.status === 'ACTIVE').length);
            if (vals[2]) vals[2].textContent = String(allB.filter(b => b.status === 'COLLECTED').length);
            if (vals[3]) vals[3].textContent = String(allB.filter(b => ['CANCELLED', 'EXPIRED'].includes(b.status)).length);

            const sub = document.querySelector('.panel-subtitle');
            if (sub) sub.textContent = `${filtered.length} kết quả`;

            let tbody = document.querySelector('table tbody');
            if (!tbody) {
                const empty = document.querySelector('.panel .empty-state');
                if (empty) {
                    const wrap = document.createElement('div');
                    wrap.className = 'table-wrap';
                    wrap.innerHTML = '<table><thead><tr><th>Giao dịch</th><th>Ngăn tủ</th><th>Người nhận</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody></tbody></table>';
                    empty.replaceWith(wrap);
                    tbody = wrap.querySelector('tbody');
                }
            }
            renderBookingsTableRows(tbody, filtered);
        }
    }

    async function hydratePage() {
        const page = document.body.dataset.activePage || '';
        const requiresAuth = document.body.dataset.requiresAuth === 'true';
        const isDataPage = ['dashboard', 'lockers', 'history'].includes(page);
        let backendUser = null;

        // 1. Khôi phục tức thì danh tính backend & dữ liệu phiên vừa xem (<5ms, không nháy tab)
        try {
            const authRaw = sessionStorage.getItem('smart_locker_auth_cache_v1');
            const authParsed = authRaw ? JSON.parse(authRaw) : null;
            if (authParsed?.user && authParsed.owner === getSessionOwnerKey()) {
                backendUser = authParsed.user;
                applyBackendIdentity(backendUser);
                if (page === 'members' && backendUser?.role === 'ADMIN' && !document.body.dataset.membersWired) {
                    document.body.dataset.membersWired = '1';
                    wireMembersPage();
                }
            }
        } catch (_) {}

        if (isDataPage) {
            const cached = getCachedLockers();
            if (cached) {
                applyPageData(page, cached, { fromCache: true });
            } else {
                updateBanner('Đang tải dữ liệu lần đầu…', 'online');
                if (page === 'lockers') renderMemberSyncSkeleton();
            }
        } else {
            updateBanner('Trực tuyến · Đồng bộ thời gian thực', 'online');
        }

        // Gắn listener form sớm để người dùng thao tác được ngay
        if (page === 'lockers') {
            wireLockersSendPage();
            wireLockersReceivePage();
        }

        if (window.SmartLockerAuth?.ready) {
            const user = await window.SmartLockerAuth.ready;
            if (!user && requiresAuth) return;
            if (user) {
                if (MQTT_ENABLED) connectMqtt();
                const syncTask = api.syncAuth().then(authState => {
                    backendUser = authState.user || null;
                    applyBackendIdentity(backendUser);
                }).catch(() => {});

                if (isDataPage) {
                    const lockersTask = api.getLockers().then(res => {
                        applyPageData(page, res);
                    }).catch(err => {
                        document.body.classList.remove('data-loading');
                        if (err.code === 'MISSING_SERVICE_KEY') {
                            updateBanner('Chưa kết nối cơ sở dữ liệu máy chủ (.env)', 'mock');
                        }
                    });
                    await Promise.all([syncTask, lockersTask]);
                    let pollingLockers = false;
                    setInterval(async () => {
                        if (pollingLockers || document.hidden) return;
                        pollingLockers = true;
                        try {
                            const refreshed = await api.getLockers();
                            applyPageData(page, refreshed);
                        } catch (_) {}
                        finally {
                            pollingLockers = false;
                        }
                    }, 1000);
                } else {
                    await syncTask;
                }
            } else {
                document.body.classList.remove('data-loading');
            }
        } else {
            document.body.classList.remove('data-loading');
        }

        if (page === 'members' && backendUser?.role === 'ADMIN' && !document.body.dataset.membersWired) {
            document.body.dataset.membersWired = '1';
            wireMembersPage();
        } else if (page === 'settings') {
            wireSettingsPage();
        } else if (page === 'support' && backendUser) {
            wireSupportPage();
        }
    }

    document.addEventListener('DOMContentLoaded', hydratePage);
    return Object.freeze(api);
})();
