/**
 * FILE: tests/api_smoke.mjs
 * Bộ kiểm thử tích hợp tự động (QA Smoke & Integration Suite) cho Smart Locker v4.
 * Cách chạy (yêu cầu PHP server đang chạy ở http://127.0.0.1:8000):
 *   node tests/api_smoke.mjs
 *
 * Biến môi trường tùy chọn để chạy thêm luồng đăng nhập thật:
 *   BASE_URL=http://127.0.0.1:8000 DEVICE_KEY=<test-device-key> node tests/api_smoke.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(TEST_DIR, '../.env');
function readLocalEnv(key) {
    if (!fs.existsSync(ENV_PATH)) return '';
    const line = fs.readFileSync(ENV_PATH, 'utf8')
        .split(/\r?\n/)
        .find(item => item.trim().startsWith(`${key}=`));
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') : '';
}

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const DEVICE_KEY = process.env.DEVICE_KEY || readLocalEnv('IOT_DEVICE_KEY');
const ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || '';
const TEST_ORIGIN = process.env.TEST_ORIGIN || BASE;

assert.ok(DEVICE_KEY, 'Thiếu DEVICE_KEY và IOT_DEVICE_KEY trong .env.');

let passed = 0;

async function callJson(path, { method = 'GET', headers = {}, body = null } = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Accept': 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, headers: res.headers, json, text };
}

// 1. Health Check & CORS Headers
{
    const r = await callJson('/api.php?action=health', { headers: { Origin: TEST_ORIGIN } });
    assert.equal(r.status, 200, `Health expected 200, got ${r.status}`);
    assert.equal(r.json?.ok, true);
    assert.equal(r.headers.get('access-control-allow-origin'), TEST_ORIGIN, 'CORS must return the explicitly allowed Origin');
    passed++;
    console.log('[PASS 1] Health Check & CORS headers OK');
}

// 2. CORS Preflight OPTIONS (Cho bản mô phỏng của Phạm Vũ Lân)
{
    const r = await callJson('/api/kiosk.php', {
        method: 'OPTIONS',
        headers: { Origin: TEST_ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    assert.equal(r.status, 204, `Preflight expected 204, got ${r.status}`);
    passed++;
    console.log('[PASS 2] CORS Preflight OPTIONS OK');
}

// 3. Kiosk Security Guard (Sai X-Device-Key -> 403)
{
    const r = await callJson('/api.php?action=kiosk_state', { headers: { 'X-Device-Key': 'WRONG_KEY' } });
    assert.equal(r.status, 403, `Wrong device key expected 403, got ${r.status}`);
    passed++;
    console.log('[PASS 3] Kiosk Device-Key Guard (403) OK');
}

// 4. Auth Guard (Không có Bearer JWT -> 401)
{
    for (const ep of ['/api/lockers.php', '/api/force_open.php', '/api/telemetry.php']) {
        const method = ep.includes('force_open') ? 'POST' : 'GET';
        const r = await callJson(ep, { method });
        assert.equal(r.status, 401, `${ep} without JWT expected 401, got ${r.status}`);
    }
    passed++;
    console.log('[PASS 4] Backend JWT Auth Guards (401) OK');
}

// 5. Kiosk State & Door Event Validation (Đúng X-Device-Key)
{
    const r = await callJson('/api.php?action=kiosk_state', { headers: { 'X-Device-Key': DEVICE_KEY } });
    if (r.status === 503 && r.json?.code === 'MISSING_SERVICE_KEY') {
        console.log('[SKIP 5-7] .env chưa cấu hình SUPABASE_SECRET_KEY — hãy điền .env rồi chạy lại để test DB thật.');
    } else {
        assert.equal(r.status, 200, `kiosk_state expected 200, got ${r.status}: ${r.text}`);
        assert.equal(r.json?.ok, true);
        assert.ok(Array.isArray(r.json?.lockers) && r.json.lockers.length >= 1, 'Expected seeded lockers');
        passed++;
        console.log(`[PASS 5] Kiosk State API returned ${r.json.lockers.length} lockers OK`);

        // Validation sai event -> 422
        const badEv = await callJson('/api.php?action=kiosk_door_event', {
            method: 'POST',
            headers: { 'X-Device-Key': DEVICE_KEY },
            body: { locker_id: 1, event: 'INVALID_EVENT' },
        });
        assert.equal(badEv.status, 422);
        passed++;
        console.log('[PASS 6] Kiosk Door Event validation (422) OK');

        // Validation OTP < 6 số -> 422
        const badOtp = await callJson('/api/verify_otp.php', {
            method: 'POST',
            headers: { 'X-Device-Key': DEVICE_KEY },
            body: { otp: '123', locker_id: 1 },
        });
        assert.equal(badOtp.status, 422);
        passed++;
        console.log('[PASS 7] OTP format validation (422) OK');
    }
}

// 6. Optional Full E2E Booking -> Race 409 -> OTP -> Door Close -> Reset (khi có TEST_ADMIN_TOKEN)
if (ADMIN_TOKEN) {
    const authHdr = { 'Authorization': `Bearer ${ADMIN_TOKEN}` };
    // Reset Tủ 02 trước khi test
    await callJson('/api/reset_locker.php', { method: 'POST', headers: authHdr, body: { locker_id: 2 } });

    // Tạo đơn trên Tủ 02
    const b1 = await callJson('/api/create_booking.php', {
        method: 'POST',
        headers: authHdr,
        body: { locker_id: 2, category: 'HOT_FOOD', recipient_email: 'qa@example.com', target_temp: 55, expires_in_minutes: 30 },
    });
    assert.equal(b1.status, 201, `Booking 1 expected 201, got ${b1.status}: ${b1.text}`);
    assert.ok(b1.json.booking.shipper_otp.startsWith('2'), 'HOT_FOOD must produce Smart Prefix 2');

    // Đặt trùng Tủ 02 -> 409 Conflict
    const b2 = await callJson('/api/create_booking.php', {
        method: 'POST',
        headers: authHdr,
        body: { locker_id: 2, category: 'PARCEL', recipient_email: 'qa2@example.com', target_temp: 25 },
    });
    assert.equal(b2.status, 409, `Duplicate booking expected 409, got ${b2.status}`);

    // Shipper OTP mở tủ 1 lần -> 200, dùng lại -> 409
    const s1 = await callJson('/api/verify_otp.php', {
        method: 'POST',
        headers: { 'X-Device-Key': DEVICE_KEY },
        body: { otp: b1.json.booking.shipper_otp, locker_id: 2 },
    });
    assert.equal(s1.status, 200);
    const s2 = await callJson('/api/verify_otp.php', {
        method: 'POST',
        headers: { 'X-Device-Key': DEVICE_KEY },
        body: { otp: b1.json.booking.shipper_otp, locker_id: 2 },
    });
    assert.equal(s2.status, 409);

    // Kiosk đóng cửa sau bỏ hàng -> OCCUPIED
    const dc = await callJson('/api.php?action=kiosk_door_event', {
        method: 'POST',
        headers: { 'X-Device-Key': DEVICE_KEY },
        body: { locker_id: 2, event: 'DOOR_CLOSED', has_item: true },
    });
    assert.equal(dc.status, 200);
    assert.equal(dc.json.locker.status, 'OCCUPIED');

    // Receiver OTP lấy hàng -> 200 -> Kiosk đóng cửa -> AVAILABLE
    const r1 = await callJson('/api/verify_otp.php', {
        method: 'POST',
        headers: { 'X-Device-Key': DEVICE_KEY },
        body: { otp: b1.json.booking.receiver_otp, locker_id: 2 },
    });
    assert.equal(r1.status, 200);
    const dc2 = await callJson('/api.php?action=kiosk_door_event', {
        method: 'POST',
        headers: { 'X-Device-Key': DEVICE_KEY },
        body: { locker_id: 2, event: 'DOOR_CLOSED', has_item: false },
    });
    assert.equal(dc2.status, 200);
    assert.equal(dc2.json.locker.status, 'AVAILABLE');
    passed++;
    console.log('[PASS 8] Full E2E Lifecycle (Create -> 409 Race -> Shipper OTP Single-Use -> Door Close -> Receiver Pickup -> Available) OK');
}

console.log(`\nALL SMOKE CHECKS PASSED: ${passed} checks completed.`);
