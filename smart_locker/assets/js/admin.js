/**
 * FILE: assets/js/admin.js
 * Phụ trách: Ngọc Hiếu
 * Chức năng: Bảng điều khiển Quản trị Doanh nghiệp (admin.php) theo thời gian thực:
 * - Tự động đồng bộ 9 ngăn tủ + thống kê + cảnh báo AI nhiệt học.
 * - Vẽ biểu đồ nhiệt độ thời gian thực từ bảng `telemetry_logs` (Chart.js) & tự nối điểm khi MQTT/Simulator đẩy dữ liệu.
 * - Kích hoạt nút Mở khóa khẩn cấp (force_open.php), Đặt lại tủ (reset_locker.php), Chỉnh nhiệt độ (PATCH lockers.php).
 */
(() => {
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
            badge.className = 'status-badge ' + (efficiency >= 75 ? 'status-available' : (efficiency >= 45 ? 'status-occupied' : 'status-error'));
            badge.innerHTML = `<i></i>Hiệu suất AI: ${efficiency}%`;
        }
        const slopeEl = document.getElementById('chart-slope-info');
        if (slopeEl && slopePerMin !== null && !Number.isNaN(slopePerMin)) {
            const sign = slopePerMin > 0 ? '+' : '';
            slopeEl.textContent = `Tốc độ biến thiên (dT/dt): ${sign}${slopePerMin} °C/phút`;
        }
    }

    // [VẤN ĐÁP]: Khởi tạo biểu đồ 2 đường (Nhiệt độ thực tế vs Nhiệt độ mục tiêu Setpoint) bằng Chart.js
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
                        pointHoverRadius: 5,
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
                    y: {
                        title: { display: true, text: 'Nhiệt độ (°C)', font: { size: 11 } },
                        suggestedMin: 0,
                        suggestedMax: 35,
                        grid: { color: '#edf0e9' },
                    },
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
                if (metaEl) {
                    metaEl.textContent = `Tủ ${String(selectedChartLockerId).padStart(2, '0')} · Đã nạp ${points.length} mẫu từ telemetry_logs (Mới nhất: ${Number(last.current_temp).toFixed(1)}°C / Mục tiêu ${Number(last.target_temp).toFixed(1)}°C).`;
                }
            } else {
                updateChartBadge(100, 0);
                if (metaEl) {
                    metaEl.textContent = `Tủ ${String(selectedChartLockerId).padStart(2, '0')} chưa có log trong Supabase. Hãy chạy Wokwi hoặc bấm "Bật/Tắt Giả lập Mạch" để vẽ trực tiếp.`;
                }
            }
        } catch (err) {
            if (metaEl) {
                metaEl.textContent = `Đang chờ kết nối Supabase (${err.message}). Biểu đồ vẫn sẽ tự vẽ khi nhận gói tin MQTT / Simulator.`;
            }
        }
    }

    // [VẤN ĐÁP]: Cơ chế Sliding Window (tối đa 30 điểm) nối trực tiếp dữ liệu MQTT/Simulator vào Chart.js không cần gọi lại HTTP.
    function pushLivePointToChart(hw) {
        const hwLockerId = Number(hw.locker_id || 1);
        if (hwLockerId !== selectedChartLockerId) return;
        const chart = ensureChart();
        if (!chart || typeof hw.current_temp === 'undefined') return;

        const curTemp = Number(hw.current_temp);
        const tgtTemp = Number(hw.target_temp ?? 8.0);
        const drift = Math.abs(curTemp - tgtTemp);
        const eff = hw.door_locked === false ? Math.max(15, 100 - Math.round(drift * 6) - 35) : Math.max(20, 100 - Math.round(drift * 4));

        const prevMeta = chartMetaPoints[chartMetaPoints.length - 1];
        let slope = 0;
        if (prevMeta && typeof prevMeta.current_temp !== 'undefined') {
            slope = Number((((curTemp - Number(prevMeta.current_temp)) / 3) * 60).toFixed(2));
        }

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

        // Đổi màu đường biểu đồ sang đỏ nếu lệch nhiệt độ quá 6°C hoặc hở cửa
        chart.data.datasets[0].borderColor = (drift > 6 || hw.door_locked === false) ? '#dc2626' : '#173f35';

        if (chart.data.labels.length > MAX_CHART_POINTS) {
            chartMetaPoints.shift();
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
        }

        chart.update('none');
        updateChartBadge(eff, slope);

        const metaEl = document.getElementById('thermal-chart-meta');
        if (metaEl) {
            metaEl.textContent = `Tủ ${String(selectedChartLockerId).padStart(2, '0')} (LIVE) · Nhiệt độ: ${curTemp.toFixed(1)}°C / Mục tiêu: ${tgtTemp.toFixed(1)}°C · PWM: ${pointMeta.pwm_power}%`;
        }
    }

    async function refreshAdminBoard() {
        try {
            const res = await window.SmartLockerAPI.getLockers();
            document.querySelector('[data-stat="total"]')?.replaceChildren(String(res.stats.total));
            document.querySelector('[data-stat="available"]')?.replaceChildren(String(res.stats.available));
            document.querySelector('[data-stat="occupied"]')?.replaceChildren(String(res.stats.occupied));
            document.querySelector('[data-stat="issues"]')?.replaceChildren(String(res.stats.issues));

            res.lockers.forEach(l => {
                const tile = document.querySelector(`.locker-tile[data-id="${l.id}"]`);
                const avail = l.status === 'AVAILABLE' && Boolean(l.online);
                const hasIssue = l.status === 'ERROR' || !l.online || Boolean(l.ai_analysis?.has_anomaly);
                if (tile) {
                    tile.classList.remove('available', 'occupied', 'has-issue');
                    tile.classList.add(hasIssue ? 'has-issue' : (avail ? 'available' : 'occupied'));
                    const tEl = tile.querySelector('.locker-temperature');
                    if (tEl) tEl.textContent = `${Number(l.current_temp).toFixed(1)}°C`;
                    const sEl = tile.querySelector('.locker-status');
                    if (sEl) sEl.textContent = (l.status === 'AVAILABLE' ? 'Trống' : (l.status === 'OCCUPIED' ? 'Đang dùng' : 'Bảo trì')) + (hasIssue ? ' ⚠' : '');
                }

                // Cập nhật nội dung Dialog chi tiết tủ
                const dlg = document.getElementById(`locker-detail-${l.id}`);
                if (dlg) {
                    const tempEl = dlg.querySelector('[data-dialog-temp]');
                    if (tempEl) tempEl.textContent = `${Number(l.current_temp).toFixed(1)}°C / Mục tiêu ${Number(l.target_temp).toFixed(1)}°C`;
                    const connEl = dlg.querySelector('[data-dialog-online]');
                    if (connEl) connEl.textContent = l.online ? 'Có tín hiệu (Online)' : 'Mất tín hiệu (Offline)';
                    const aiEl = dlg.querySelector('[data-dialog-ai]');
                    if (aiEl && l.ai_analysis) {
                        aiEl.textContent = `Hiệu suất ${l.ai_analysis.efficiency_score}% · ${l.ai_analysis.reason}`;
                    }
                    const otpEl = dlg.querySelector('[data-dialog-otp]');
                    if (otpEl) {
                        otpEl.textContent = l.active_receiver_otp ? `Shipper: ${l.active_shipper_otp || '—'} | Nhận: ${l.active_receiver_otp}` : 'Không có đơn đang hoạt động';
                    }
                    const tempInput = dlg.querySelector('[data-temp-input]');
                    if (tempInput && document.activeElement !== tempInput) {
                        tempInput.value = l.target_temp;
                    }
                }
            });

            // Hiển thị danh sách cảnh báo AI mới nhất
            const alertList = document.getElementById('admin-ai-alerts');
            if (alertList) {
                if (!res.alerts.length) {
                    alertList.innerHTML = '<p class="helper-copy">Tất cả 9 ngăn tủ đang vận hành ổn định, chưa có bất thường nhiệt học.</p>';
                } else {
                    alertList.innerHTML = res.alerts.slice(0, 5).map(a =>
                        `<div style="padding:10px 12px;border-radius:10px;background:#fff3f4;border:1px solid #f5c2c7;margin-bottom:8px;font-size:13px">
                            <strong>[${a.severity}] Tủ ${String(a.locker_id).padStart(2, '0')}:</strong> ${a.message}
                        </div>`
                    ).join('');
                }
            }
        } catch (err) {
            console.warn('[Admin Refresh]', err.message);
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (window.SmartLockerAuth?.ready) {
            const user = await window.SmartLockerAuth.ready;
            if (!user) return;
        }

        // Gắn sự kiện Mở khóa khẩn cấp
        document.querySelectorAll('[data-force-open]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.forceOpen);
                btn.disabled = true;
                try {
                    const res = await window.SmartLockerAPI.forceOpen(id);
                    window.showToast(res.message);
                    refreshAdminBoard();
                } catch (err) {
                    window.showToast(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Gắn sự kiện Đặt lại / Hủy giao dịch
        document.querySelectorAll('[data-reset-locker]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.resetLocker);
                if (!confirm(`Xác nhận đặt lại Tủ ${String(id).padStart(2, '0')} về trạng thái Trống và hủy đơn cũ?`)) return;
                btn.disabled = true;
                try {
                    const res = await window.SmartLockerAPI.resetLocker(id);
                    window.showToast(res.message);
                    btn.closest('dialog')?.close();
                    refreshAdminBoard();
                } catch (err) {
                    window.showToast(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Gắn sự kiện Chỉnh nhiệt độ trực tiếp
        document.querySelectorAll('[data-set-temp-btn]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.setTempBtn);
                const input = btn.closest('dialog')?.querySelector('[data-temp-input]');
                const temp = Number(input?.value || 8);
                btn.disabled = true;
                try {
                    const res = await window.SmartLockerAPI.setLockerTemp(id, temp);
                    window.showToast(res.message);
                    refreshAdminBoard();
                    if (id === selectedChartLockerId) loadThermalChart(id);
                } catch (err) {
                    window.showToast(err.message, true);
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Điều khiển chọn tủ & làm mới biểu đồ nhiệt độ
        const chartSelect = document.getElementById('chart-locker-select');
        chartSelect?.addEventListener('change', () => loadThermalChart(Number(chartSelect.value)));
        document.getElementById('btn-refresh-chart')?.addEventListener('click', () => loadThermalChart(selectedChartLockerId));

        // Nút bật/tắt Virtual IoT Simulator trên Admin
        document.getElementById('btn-toggle-sim')?.addEventListener('click', () => {
            window.SmartLockerAPI.toggleVirtualSimulator(false);
        });
        document.getElementById('btn-sim-fault')?.addEventListener('click', () => {
            window.SmartLockerAPI.toggleVirtualSimulator(true);
        });

        refreshAdminBoard();
        loadThermalChart(1);
        setInterval(refreshAdminBoard, 8000);
        window.SmartLockerAPI.onHardwareUpdate((hwData) => {
            pushLivePointToChart(hwData);
            refreshAdminBoard();
        });
    });
})();
