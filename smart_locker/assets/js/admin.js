/**
 * FILE: assets/js/admin.js
 * Phụ trách: Ngọc Hiếu (nhánh backend)
 * Thiết kế Zero-Touch:
 *  - Chạy trực tiếp trên `admin.php` nguyên bản của nhánh `main` mà không cần sửa HTML gốc.
 *  - Tự nạp Chart.js, dựng bảng Biểu đồ nhiệt độ thời gian thực (telemetry_logs + MQTT),
 *    khối Giám sát AI & Virtual Simulator, kích hoạt nút Mở khóa khẩn cấp / Reset / Chỉnh nhiệt độ trên 9 Dialog tủ
 *    và đồng bộ bảng Giao dịch thật từ Supabase.
 */
(() => {
    const CHARTJS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    const MAX_CHART_POINTS = 30;
    let thermalChart = null;
    let selectedChartLockerId = 1;
    let chartMetaPoints = [];

    function formatClock(isoOrDate) {
        try {
            const d = isoOrDate ? new Date(isoOrDate) : new Date();
            return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (_) {
            return '--:--:--';
        }
    }

    function updateChartBadge(efficiency, slopePerMin = null) {
        const badge = document.getElementById('chart-ai-badge');
        if (badge && typeof efficiency === 'number') {
            badge.className = 'status-badge ' + (efficiency >= 75 ? 'status-available' : (efficiency >= 45 ? 'status-active' : 'status-error'));
            badge.innerHTML = `<i></i>Hiệu suất AI: ${efficiency}%`;
        }
        const slopeEl = document.getElementById('chart-slope-info');
        if (slopeEl && slopePerMin !== null && !Number.isNaN(slopePerMin)) {
            const sign = slopePerMin > 0 ? '+' : '';
            slopeEl.textContent = `Tốc độ biến thiên (dT/dt): ${sign}${slopePerMin} °C/phút`;
        }
    }

    // Dựng panel Biểu đồ nhiệt độ Live + khối AI Alerts & Simulator trên admin.php nguyên bản
    function mountAdminEnhancements() {
        const companyRoot = document.querySelector('[data-company-only]');
        if (!companyRoot || document.getElementById('thermal-live-chart')) return;

        // 1. Nâng cấp khối phải trong .dashboard-columns (thêm AI Alerts + nút Simulator)
        const rightPanelBody = companyRoot.querySelector('.dashboard-columns > section.panel:nth-child(2) .panel-body');
        if (rightPanelBody) {
            const aiBox = document.createElement('div');
            aiBox.style.cssText = 'border-top:1px solid var(--line);padding-top:14px;margin-top:16px';
            aiBox.innerHTML = `
                <strong style="display:block;font-size:12px;margin-bottom:8px">Cảnh báo AI &amp; Kiểm thử Mạch</strong>
                <div id="admin-ai-alerts" style="margin-bottom:12px"><p class="helper-copy">Đang tải dữ liệu phân tích nhiệt học...</p></div>
                <div class="hero-actions" style="margin:0;gap:8px;flex-wrap:wrap">
                    <button class="button button-dark button-sm" type="button" id="btn-toggle-sim">Bật/Tắt Giả lập Mạch</button>
                    <button class="button button-danger button-sm" type="button" id="btn-sim-fault">Giả lập lỗi rò rỉ nhiệt (AI)</button>
                </div>
            `;
            rightPanelBody.appendChild(aiBox);
        }

        // 2. Chèn panel Biểu đồ nhiệt độ thời gian thực ngay sau .dashboard-columns
        const columns = companyRoot.querySelector('.dashboard-columns');
        if (columns) {
            let opts = '';
            for (let i = 1; i <= 9; i++) {
                opts += `<option value="${i}">Tủ ${String(i).padStart(2, '0')} ${i % 2 ? '(Ngăn nhiệt)' : '(Ngăn thường)'}</option>`;
            }
            const chartPanel = document.createElement('section');
            chartPanel.className = 'panel';
            chartPanel.style.marginBottom = '24px';
            chartPanel.innerHTML = `
                <div class="panel-head" style="flex-wrap:wrap">
                    <div>
                        <h2>Biểu đồ nhiệt độ thời gian thực (telemetry_logs &amp; MQTT)</h2>
                        <p id="thermal-chart-meta">So sánh nhiệt độ thực tế và nhiệt độ mục tiêu theo thời gian thực.</p>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                        <span id="chart-ai-badge" class="status-badge status-available"><i></i>Hiệu suất AI: --%</span>
                        <select id="chart-locker-select" aria-label="Chọn ngăn tủ xem biểu đồ" style="border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:#fff;font-size:12px;color:var(--ink)">${opts}</select>
                        <button class="button button-light button-sm" type="button" id="btn-refresh-chart">Tải lại</button>
                    </div>
                </div>
                <div class="panel-body">
                    <div style="position:relative;height:270px;width:100%">
                        <canvas id="thermal-live-chart" aria-label="Biểu đồ nhiệt độ thời gian thực"></canvas>
                    </div>
                    <div class="chart-foot" style="margin-top:14px;justify-content:space-between;flex-wrap:wrap;gap:10px">
                        <span style="display:flex;align-items:center;gap:6px"><span class="status-dot"></span>Tự động nối điểm mới khi tủ mô phỏng / mạch ESP32 gửi nhiệt độ</span>
                        <span id="chart-slope-info" style="font-weight:600;color:var(--green)">Tốc độ biến thiên (dT/dt): -- °C/phút</span>
                    </div>
                </div>
            `;
            columns.insertAdjacentElement('afterend', chartPanel);
        }

        // 3. Nâng cấp 9 Dialog chi tiết tủ nguyên bản (kích hoạt nút + thêm OTP, AI, chỉnh nhiệt độ)
        document.querySelectorAll('dialog[id^="locker-detail-"]').forEach(dlg => {
            const id = Number(dlg.id.replace('locker-detail-', ''));
            if (!id) return;
            const body = dlg.querySelector('.dialog-body');
            const dl = body?.querySelector('.definition-list');
            const dds = dl ? dl.querySelectorAll('dd') : [];
            if (dds[0]) dds[0].dataset.dialogStatus = '1';
            if (dds[1]) dds[1].dataset.dialogTemp = '1';
            if (dds[2]) dds[2].dataset.dialogOnline = '1';

            if (dl && !dl.querySelector('[data-dialog-otp]')) {
                dl.insertAdjacentHTML('beforeend', '<dt>Mã OTP hiện tại</dt><dd data-dialog-otp>Được ẩn theo chính sách bảo mật</dd><dt>Đánh giá AI</dt><dd data-dialog-ai>Đang phân tích...</dd>');
            }

            const helper = body?.querySelector('.helper-copy');
            if (helper) {
                const tempEditor = document.createElement('div');
                tempEditor.className = 'field';
                tempEditor.style.margin = '12px 0 14px';
                tempEditor.innerHTML = `
                    <label for="temp-input-${id}">Chỉnh nhiệt độ mục tiêu (°C)</label>
                    <div style="display:flex;gap:8px">
                        <input id="temp-input-${id}" type="number" min="2" max="65" step="0.5" value="8" data-temp-input>
                        <button class="button button-light button-sm" type="button" data-set-temp-btn="${id}">Cập nhật</button>
                    </div>
                `;
                helper.replaceWith(tempEditor);
            }

            const actions = body?.querySelector('.hero-actions');
            const btns = actions ? actions.querySelectorAll('button') : [];
            if (btns[0]) {
                btns[0].disabled = false;
                btns[0].className = 'button button-dark button-sm';
                btns[0].dataset.forceOpen = String(id);
            }
            if (btns[1]) {
                btns[1].disabled = false;
                btns[1].dataset.resetLocker = String(id);
            }
        });
    }

    function ensureChart() {
        const canvas = document.getElementById('thermal-live-chart');
        if (!canvas || typeof window.Chart === 'undefined') return null;
        if (thermalChart) return thermalChart;

        thermalChart = new window.Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Nhiệt độ thực tế (°C)',
                        data: [],
                        borderColor: '#173f35',
                        backgroundColor: 'rgba(23, 63, 53, 0.10)',
                        borderWidth: 2.5,
                        pointRadius: 3,
                        tension: 0.3,
                        fill: true,
                    },
                    {
                        label: 'Nhiệt độ mục tiêu (°C)',
                        data: [],
                        borderColor: '#d97706',
                        borderWidth: 2,
                        borderDash: [6, 5],
                        pointRadius: 0,
                        tension: 0,
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, font: { size: 12 } } },
                    tooltip: {
                        callbacks: {
                            afterBody(items) {
                                const idx = items?.[0]?.dataIndex;
                                const p = chartMetaPoints[idx];
                                if (!p) return [];
                                const lines = [];
                                if (typeof p.pwm_power !== 'undefined') lines.push(`Công suất PWM: ${p.pwm_power}%`);
                                if (typeof p.humidity !== 'undefined' && p.humidity !== null) lines.push(`Độ ẩm: ${p.humidity}%`);
                                if (typeof p.efficiency_score !== 'undefined') lines.push(`Hiệu suất AI: ${p.efficiency_score}%`);
                                lines.push(`Cửa tủ: ${p.door_locked === false ? 'Đang mở / Hở' : 'Đóng kín'}`);
                                return lines;
                            },
                        },
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 11 } } },
                    y: { title: { display: true, text: 'Nhiệt độ (°C)', font: { size: 11 } }, suggestedMin: 0, suggestedMax: 35, grid: { color: '#edf0e9' } },
                },
            },
        });
        return thermalChart;
    }

    async function loadThermalChart(lockerId = selectedChartLockerId) {
        selectedChartLockerId = Number(lockerId) || 1;
        const chart = ensureChart();
        const metaEl = document.getElementById('thermal-chart-meta');
        if (!chart) return;
        try {
            const res = await window.SmartLockerAPI.getTelemetry(selectedChartLockerId, MAX_CHART_POINTS);
            const points = Array.isArray(res.points) ? res.points : [];
            chartMetaPoints = points;
            chart.data.labels = points.map(p => formatClock(p.recorded_at));
            chart.data.datasets[0].data = points.map(p => Number(p.current_temp));
            chart.data.datasets[1].data = points.map(p => Number(p.target_temp));
            chart.update();
            if (points.length) {
                const last = points[points.length - 1];
                updateChartBadge(Number(last.efficiency_score ?? 100), Number(res.slope_c_per_min ?? 0));
                if (metaEl) metaEl.textContent = `Tủ ${String(selectedChartLockerId).padStart(2, '0')} · Đã nạp ${points.length} mẫu từ telemetry_logs (Mới nhất: ${Number(last.current_temp).toFixed(1)}°C / Mục tiêu ${Number(last.target_temp).toFixed(1)}°C).`;
            } else {
                updateChartBadge(100, 0);
                if (metaEl) metaEl.textContent = `Tủ ${String(selectedChartLockerId).padStart(2, '0')} chưa có log trong Supabase. Hãy bật Giả lập Mạch hoặc kết nối tủ mô phỏng để vẽ trực tiếp.`;
            }
        } catch (err) {
            if (metaEl) metaEl.textContent = `Đang chờ kết nối Supabase (${err.message}). Biểu đồ vẫn sẽ tự vẽ khi nhận gói tin MQTT / Simulator.`;
        }
    }

    function pushLivePointToChart(hw) {
        if (Number(hw.locker_id || 1) !== selectedChartLockerId) return;
        const chart = ensureChart();
        if (!chart || typeof hw.current_temp === 'undefined') return;
        const curTemp = Number(hw.current_temp);
        const tgtTemp = Number(hw.target_temp ?? 8.0);
        const drift = Math.abs(curTemp - tgtTemp);
        const eff = hw.door_locked === false ? Math.max(15, 100 - Math.round(drift * 6) - 35) : Math.max(20, 100 - Math.round(drift * 4));
        const prevMeta = chartMetaPoints[chartMetaPoints.length - 1];
        const slope = prevMeta ? Number((((curTemp - Number(prevMeta.current_temp)) / 3) * 60).toFixed(2)) : 0;

        const pointMeta = {
            current_temp: curTemp,
            target_temp: tgtTemp,
            humidity: hw.humidity ?? null,
            pwm_power: hw.pwm_power ?? 0,
            door_locked: hw.door_locked !== false,
            efficiency_score: eff,
            recorded_at: new Date().toISOString(),
        };
        chartMetaPoints.push(pointMeta);
        chart.data.labels.push(formatClock(pointMeta.recorded_at));
        chart.data.datasets[0].data.push(curTemp);
        chart.data.datasets[1].data.push(tgtTemp);
        chart.data.datasets[0].borderColor = (drift > 6 || hw.door_locked === false) ? '#dc2626' : '#173f35';

        if (chart.data.labels.length > MAX_CHART_POINTS) {
            chartMetaPoints.shift();
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
        }
        chart.update('none');
        updateChartBadge(eff, slope);
    }

    async function refreshAdminBoard() {
        const apiRef = window.SmartLockerAPI;
        if (!apiRef) return;
        try {
            const res = await apiRef.getLockers();
            const vals = document.querySelectorAll('.stats-grid .stat-value');
            if (vals[0]) vals[0].textContent = String(res.stats.total);
            if (vals[1]) vals[1].textContent = String(res.stats.available);
            if (vals[2]) vals[2].textContent = String(res.stats.occupied);
            if (vals[3]) vals[3].textContent = String(res.stats.issues);

            apiRef.updateLockerTiles(res.lockers, true);

            res.lockers.forEach(l => {
                const dlg = document.getElementById(`locker-detail-${l.id}`);
                if (!dlg) return;
                const label = apiRef.statusText(l.status);
                const stEl = dlg.querySelector('[data-dialog-status]');
                if (stEl) stEl.innerHTML = `<span class="status-badge ${apiRef.statusBadgeClass(l.status)}"><i></i>${apiRef.escapeHtml(label)}</span>`;
                const tempEl = dlg.querySelector('[data-dialog-temp]');
                if (tempEl) tempEl.textContent = `${Number(l.current_temp).toFixed(1)}°C / Mục tiêu ${Number(l.target_temp).toFixed(1)}°C`;
                const connEl = dlg.querySelector('[data-dialog-online]');
                if (connEl) connEl.textContent = l.online ? 'Có tín hiệu (Online)' : 'Mất tín hiệu (Offline)';
                const aiEl = dlg.querySelector('[data-dialog-ai]');
                if (aiEl && l.ai_analysis) aiEl.textContent = `Hiệu suất ${l.ai_analysis.efficiency_score}% · ${l.ai_analysis.reason}`;
                const otpEl = dlg.querySelector('[data-dialog-otp]');
                if (otpEl) otpEl.textContent = 'Được ẩn theo chính sách bảo mật';
                const tempInput = dlg.querySelector('[data-temp-input]');
                if (tempInput && document.activeElement !== tempInput) tempInput.value = l.target_temp;
            });

            apiRef.renderBookingsTableRows(document.querySelector('table tbody'), (res.bookings || []).slice(0, 10));

            const alertList = document.getElementById('admin-ai-alerts');
            if (alertList) {
                if (!res.alerts.length) {
                    alertList.innerHTML = '<p class="helper-copy">Tất cả 9 ngăn tủ vận hành ổn định, chưa có bất thường.</p>';
                } else {
                    alertList.innerHTML = res.alerts.slice(0, 5).map(a =>
                        `<div style="padding:10px 12px;border-radius:10px;background:#fff3f4;border:1px solid #f5c2c7;margin-bottom:8px;font-size:12px">
                            <strong>[${apiRef.escapeHtml(a.severity)}] Tủ ${String(a.locker_id).padStart(2, '0')}:</strong> ${apiRef.escapeHtml(a.message)}
                        </div>`
                    ).join('');
                }
            }
        } catch (err) {
            console.warn('[Admin Refresh]', err.message);
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (!window.SmartLockerAPI) return;
        if (window.SmartLockerAuth?.ready) {
            const user = await window.SmartLockerAuth.ready;
            if (!user) return;
        }

        try {
            const authState = await window.SmartLockerAPI.syncAuth();
            if (authState.user?.role !== 'ADMIN') {
                window.showToast?.('Bạn không có quyền truy cập khu vực quản trị.', true);
                location.replace('dashboard.php');
                return;
            }
        } catch (err) {
            window.showToast?.(err.message || 'Không xác minh được quyền quản trị.', true);
            return;
        }

        mountAdminEnhancements();
        if (typeof window.Chart === 'undefined') {
            await window.SmartLockerAPI.loadScriptOnce(CHARTJS_CDN);
        }

        document.querySelectorAll('[data-force-open]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.forceOpen);
                btn.disabled = true;
                try {
                    const res = await window.SmartLockerAPI.forceOpen(id);
                    window.showToast?.(res.message);
                    refreshAdminBoard();
                } catch (err) {
                    window.showToast?.(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        document.querySelectorAll('[data-reset-locker]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.resetLocker);
                if (!confirm(`Xác nhận đặt lại Tủ ${String(id).padStart(2, '0')} về trạng thái Trống và hủy đơn cũ?`)) return;
                btn.disabled = true;
                try {
                    const res = await window.SmartLockerAPI.resetLocker(id);
                    window.showToast?.(res.message);
                    btn.closest('dialog')?.close();
                    refreshAdminBoard();
                } catch (err) {
                    window.showToast?.(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        document.querySelectorAll('[data-set-temp-btn]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.setTempBtn);
                const input = btn.closest('dialog')?.querySelector('[data-temp-input]');
                const temp = Number(input?.value || 8);
                btn.disabled = true;
                try {
                    const res = await window.SmartLockerAPI.setLockerTemp(id, temp);
                    window.showToast?.(res.message);
                    refreshAdminBoard();
                    if (id === selectedChartLockerId) loadThermalChart(id);
                } catch (err) {
                    window.showToast?.(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        const chartSelect = document.getElementById('chart-locker-select');
        chartSelect?.addEventListener('change', () => loadThermalChart(Number(chartSelect.value)));
        document.getElementById('btn-refresh-chart')?.addEventListener('click', () => loadThermalChart(selectedChartLockerId));
        document.getElementById('btn-toggle-sim')?.addEventListener('click', () => window.SmartLockerAPI.toggleVirtualSimulator(false));
        document.getElementById('btn-sim-fault')?.addEventListener('click', () => window.SmartLockerAPI.toggleVirtualSimulator(true));

        refreshAdminBoard();
        loadThermalChart(1);
        setInterval(refreshAdminBoard, 8000);
        window.SmartLockerAPI.onHardwareUpdate((hwData) => {
            pushLivePointToChart(hwData);
            refreshAdminBoard();
        });
    });
})();
