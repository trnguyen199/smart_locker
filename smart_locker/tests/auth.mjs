// Kiểm tra luồng điều hướng Auth bằng SDK giả lập; không tạo tài khoản hoặc gọi Supabase thật.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const authCode = fs.readFileSync(new URL('../assets/js/auth.js', import.meta.url), 'utf8');
const clientCode = fs.readFileSync(new URL('../assets/js/supabase-client.js', import.meta.url), 'utf8');
let checks = 0;
function scenario({ mode, session = null, configured = true, protectedPage = false, query = '', responses = {}, userError = null, callback = false } = {}) {
    const calls = [];
    const attributes = {};
    const button = { disabled: false, setAttribute(name) { attributes[name] = true; if (name === 'disabled') this.disabled = true; }, removeAttribute(name) { delete attributes[name]; } };
    const output = { textContent: '', classList: { toggle() {} } };
    const fields = { email: 'user@example.test', password: 'a-strong-password', name: 'Test User', company_name: 'Test Company', account_type: 'company', password_confirm: 'a-strong-password' };
    const form = { dataset: { authForm: mode }, events: {}, resetCount: 0,
        querySelector(selector) { return selector === '[data-auth-message]' ? output : button; },
        addEventListener(event, fn) { this.events[event] = fn; }, reset() { this.resetCount++; } };
    const status = { textContent: '' };
    const heading = { textContent: '' };
    const location = { href: 'http://localhost:8000/smart_locker/login.php' + query, search: query, pathname: '/smart_locker/login.php', hash: '',
        assign(path) { calls.push(['assign', path]); }, replace(path) { calls.push(['replace', path]); } };
    let stateCallback;
    const user = { id: 'test-user', email: fields.email, user_metadata: { full_name: 'Test User', company_name: 'Test Company' } };
    const auth = {
        async getSession() { return { data: { session }, error: null }; },
        async getUser() { calls.push(['getUser']); return { data: { user }, error: userError }; },
        onAuthStateChange(fn) { stateCallback = fn; },
    };
    for (const method of ['signInWithPassword', 'signUp', 'resetPasswordForEmail', 'updateUser', 'signOut']) auth[method] = async (...args) => {
        calls.push([method, ...args]);
        return responses[method] || { data: { session: { user } }, error: null };
    };
    const context = { URL, URLSearchParams, TypeError, console, window: {}, location,
        SmartLockerSupabase: { isConfigured: () => configured, getClient: () => ({ auth }) },
        FormData: class { get(key) { return fields[key]; } },
        showToast(text) { calls.push(['toast', text]); },
        document: { body: { dataset: { requiresAuth: String(protectedPage), activePage: 'dashboard' }, classList: { remove(name) { calls.push(['reveal', name]); } } },
            querySelectorAll(selector) { return selector === '[data-auth-form]' && mode ? [form] : []; },
            querySelector(selector) { if (selector === '.page-heading h1') return heading; if (selector.includes('data-auth-callback') && callback) return status; return null; } },
    };
    vm.runInNewContext(authCode, context);
    return { ...context, form, output, calls, fields, status, heading, button, triggerState: (...args) => stateCallback?.(...args),
        submit: () => form.events.submit({ preventDefault() {} }) };
}

let s = scenario({ protectedPage: true }); await s.window.SmartLockerAuth.ready;
assert(s.calls.some(c => c[0] === 'replace' && c[1].startsWith('login.php?next='))); checks++;
s = scenario({ mode: 'login', configured: false }); await s.window.SmartLockerAuth.ready;
assert(s.button.disabled && s.output.textContent.includes('Supabase')); checks++;
s = scenario({ protectedPage: true, session: {} }); await s.window.SmartLockerAuth.ready;
assert(s.calls.some(c => c[0] === 'getUser') && s.calls.some(c => c[0] === 'reveal')); checks++;
assert(s.heading.textContent.includes('Test User')); checks++;
s.triggerState('SIGNED_OUT', null); assert(s.calls.some(c => c[0] === 'replace')); checks++;
s = scenario({ protectedPage: true, session: {}, userError: { message: 'expired' } }); await s.window.SmartLockerAuth.ready;
assert(!s.calls.some(c => c[0] === 'reveal') && s.calls.some(c => c[0] === 'replace')); checks++;
s = scenario({ mode: 'login', query: '?next=lockers.php%3Fmode%3Dreceive' }); await s.window.SmartLockerAuth.ready; await s.submit();
assert(s.calls.some(c => c[0] === 'assign' && c[1] === 'lockers.php?mode=receive')); checks++;
assert.equal(s.window.SmartLockerAuth.nextPage('https://attacker.example/dashboard.php'), 'dashboard.php'); checks++;
assert.equal(s.window.SmartLockerAuth.nextPage('../admin.php'), 'dashboard.php'); checks++;
assert.equal(s.window.SmartLockerAuth.nextPage('javascript:alert(1)'), 'dashboard.php'); checks++;
s = scenario({ mode: 'login', responses: { signInWithPassword: { data: {}, error: { code: 'invalid_credentials' } } } }); await s.window.SmartLockerAuth.ready; await s.submit();
assert(s.output.textContent.includes('mật khẩu') && !s.calls.some(c => c[0] === 'assign')); checks++;
s = scenario({ mode: 'register', responses: { signUp: { data: { session: null }, error: null } } }); await s.window.SmartLockerAuth.ready; await s.submit();
assert(s.output.textContent.includes('email') && s.form.resetCount === 1 && !s.calls.some(c => c[0] === 'assign')); checks++;
const signup = s.calls.find(c => c[0] === 'signUp')[1];
assert.equal(signup.options.emailRedirectTo, 'http://localhost:8000/smart_locker/auth-callback.php'); checks++;
assert.equal(signup.options.data.company_name, 'Test Company'); checks++;
assert.equal(signup.options.data.account_type, 'company'); checks++;
s = scenario({ mode: 'register' }); s.fields.account_type = 'company'; s.fields.company_name = ''; await s.window.SmartLockerAuth.ready; await s.submit();
assert(s.output.textContent.includes('tên công ty') && !s.calls.some(c => c[0] === 'signUp')); checks++;
s = scenario({ mode: 'register', responses: { signUp: { data: { session: null }, error: null } } }); s.fields.account_type = 'user'; s.fields.company_name = ''; await s.window.SmartLockerAuth.ready; await s.submit();
assert.equal(s.calls.find(c => c[0] === 'signUp')[1].options.data.account_type, 'user'); checks++;
assert.equal(s.window.SmartLockerAuth.resolveAccountType({ user_metadata: { account_type: 'user', company_name: 'ACME' } }), 'user'); checks++;
assert.equal(s.window.SmartLockerAuth.resolveAccountType({ user_metadata: { account_type: 'company' } }), 'company'); checks++;
assert.equal(s.window.SmartLockerAuth.resolveAccountType({ user_metadata: {} }), 'user'); checks++;
s = scenario({ mode: 'register' }); await s.window.SmartLockerAuth.ready; await s.submit();
assert(s.calls.some(c => c[0] === 'assign' && c[1] === 'dashboard.php')); checks++;
s = scenario({ mode: 'forgot' }); await s.window.SmartLockerAuth.ready; await s.submit();
assert.equal(s.calls.find(c => c[0] === 'resetPasswordForEmail')[2].redirectTo, 'http://localhost:8000/smart_locker/update-password.php'); checks++;
s = scenario({ mode: 'update-password', protectedPage: true, session: {} }); await s.window.SmartLockerAuth.ready;
s.fields.password_confirm = 'different'; await s.submit(); assert(!s.calls.some(c => c[0] === 'updateUser')); checks++;
s.fields.password_confirm = s.fields.password; await s.submit(); assert(s.calls.some(c => c[0] === 'updateUser')); checks++;
await s.window.SmartLockerAuth.signOut(); assert.equal(s.calls.find(c => c[0] === 'signOut')[1].scope, 'local'); checks++;
s = scenario({ callback: true, session: {} }); await s.window.SmartLockerAuth.ready;
assert(s.calls.some(c => c[0] === 'replace' && c[1] === 'dashboard.php')); checks++;
let initCount = 0;
const sdk = { window: { SMART_LOCKER_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' }, supabase: { createClient() { initCount++; return {}; } } } };
vm.runInNewContext(clientCode, sdk);
sdk.window.SmartLockerSupabase.getClient(); sdk.window.SmartLockerSupabase.getClient(); assert.equal(initCount, 1); checks++;
sdk.window.SMART_LOCKER_SUPABASE.publishableKey = 'sb_secret_test';
const unsafe = { window: { SMART_LOCKER_SUPABASE: sdk.window.SMART_LOCKER_SUPABASE, supabase: sdk.window.supabase } };
vm.runInNewContext(clientCode, unsafe); assert.throws(() => unsafe.window.SmartLockerSupabase.getClient(), /Publishable/); checks++;
console.log(`PASS: ${checks} Auth checks (mock SDK): route guards, safe redirects, login, signup confirmation, recovery, logout and configuration.`);
