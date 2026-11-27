import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

for (const privatePath of ['/.env', '/.env.example', '/.htaccess', '/config/env.php', '/tests/auth.mjs', '/supabase/schema.sql']) {
    const response = await fetch(`${BASE}${privatePath}`);
    assert.equal(response.status, 404, `${privatePath} must not be publicly accessible`);
}

const blockedOrigin = 'https://attacker.invalid';
const blockedPreflight = await fetch(`${BASE}/api.php?action=health`, {
    method: 'OPTIONS',
    headers: {
        Origin: blockedOrigin,
        'Access-Control-Request-Method': 'GET',
    },
});
assert.equal(blockedPreflight.status, 403, 'Unknown CORS origin must be rejected');
assert.equal(blockedPreflight.headers.get('access-control-allow-origin'), null);

const adminPage = await fetch(`${BASE}/admin.php`);
assert.equal(adminPage.status, 200);
const html = await adminPage.text();
assert.match(html, /assets\/js\/api\.js/);
assert.match(html, /assets\/js\/admin\.js/);

console.log('PASS: private files blocked, CORS allowlist enforced, backend scripts integrated.');
