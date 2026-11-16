// Đăng nhập và điều hướng dùng Supabase Auth trực tiếp, không gọi api/*.php.
window.SmartLockerAuth = (() => {
    const protectedPage = document.body.dataset.requiresAuth === 'true';
    const forms = [...document.querySelectorAll('[data-auth-form]')];
    const allowedPages = new Set(['dashboard.php', 'lockers.php', 'history.php', 'admin.php', 'members.php', 'settings.php', 'support.php']);

    function nextPage(value = new URLSearchParams(location.search).get('next')) {
        try {
            const base = new URL('.', location.href);
            const candidate = new URL(value || 'dashboard.php', base);
            const relative = candidate.pathname.slice(base.pathname.length);
            if (candidate.origin === base.origin && candidate.pathname.startsWith(base.pathname) && allowedPages.has(relative)) return relative + candidate.search;
        } catch (_) {}
        return 'dashboard.php';
    }
    function loginUrl() {
        const filename = location.pathname.split('/').pop();
        const target = allowedPages.has(filename) ? filename + location.search : 'dashboard.php';
        return 'login.php?next=' + encodeURIComponent(target);
    }
    function message(form, text, success = false) {
        const output = form.querySelector('[data-auth-message]');
        if (output) { output.textContent = text; output.classList.toggle('success', success); }
    }
    function errorMessage(error) {
        const messages = {
            invalid_credentials: 'Email hoặc mật khẩu chưa đúng.',
            email_not_confirmed: 'Vui lòng xác nhận email trước khi đăng nhập.',
            user_already_exists: 'Email này đã có tài khoản. Hãy đăng nhập.',
            over_email_send_rate_limit: 'Đã gửi nhiều email. Vui lòng chờ một lúc rồi thử lại.',
            over_request_rate_limit: 'Đã thử quá nhiều lần. Vui lòng thử lại sau.',
            weak_password: 'Mật khẩu chưa đáp ứng chính sách của hệ thống.',
            signup_disabled: 'Đăng ký tài khoản hiện đang được tắt.',
        };
        return messages[error?.code] || (error instanceof TypeError ? 'Không thể kết nối máy chủ đăng nhập. Vui lòng kiểm tra Internet.' : error?.message) || 'Không thể đăng nhập. Vui lòng thử lại.';
    }
    function hydrateUser(user) {
        const metadata = user?.user_metadata || {};
        const fullName = typeof metadata.full_name === 'string' ? metadata.full_name : '';
        const fallbackName = typeof metadata.name === 'string' ? metadata.name : '';
        const name = fullName.trim() || fallbackName.trim() || user?.email?.split('@')[0] || 'Bạn';
        const company = typeof metadata.company_name === 'string' && metadata.company_name.trim() ? metadata.company_name : 'Không gian doanh nghiệp';
        const words = name.trim().split(/\s+/u);
        const initials = ((words[0]?.[0] || 'S') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase();
        for (const [selector, text] of [['[data-user-name]',name],['[data-user-email]',user?.email || ''],['[data-user-initials]',initials],['[data-company-name]',company]]) {
            document.querySelectorAll(selector).forEach(element => { if (element.matches('input')) element.value = text; else element.textContent = text; });
        }
        document.querySelectorAll('[data-user-only]').forEach(element => { element.hidden = !user; });
        document.querySelectorAll('[data-guest-only]').forEach(element => { element.hidden = Boolean(user); });
        if (user && document.body.dataset.activePage === 'dashboard') {
            const heading = document.querySelector('.page-heading h1');
            if (heading) heading.textContent = 'Chào ' + name + ', một ngày tốt lành!';
        }
    }
    async function signOut() {
        const { error } = await SmartLockerSupabase.getClient().auth.signOut({ scope: 'local' });
        if (error) throw error;
        location.replace('login.php');
    }

    forms.forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        if (button?.disabled) return;
        message(form, '');
        if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
        try {
            const client = SmartLockerSupabase.getClient();
            const fields = new FormData(form);
            const email = String(fields.get('email') || '').trim();
            const password = String(fields.get('password') || '');
            if (form.dataset.authForm === 'login') {
                const { data, error } = await client.auth.signInWithPassword({ email, password });
                if (error) throw error;
                if (!data.session) throw new Error('Chưa tạo được phiên đăng nhập. Vui lòng thử lại.');
                location.assign(nextPage());
            } else if (form.dataset.authForm === 'register') {
                const { data, error } = await client.auth.signUp({ email, password, options: {
                    data: { full_name: String(fields.get('name') || '').trim(), company_name: String(fields.get('company_name') || '').trim() },
                    emailRedirectTo: new URL('auth-callback.php', location.href).href,
                } });
                if (error) throw error;
                if (data.session) location.assign('dashboard.php');
                else { message(form, 'Vui lòng kiểm tra email và bấm liên kết xác nhận. Nếu email đã được đăng ký, hãy đăng nhập.', true); form.reset(); }
            } else if (form.dataset.authForm === 'forgot') {
                const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: new URL('update-password.php', location.href).href });
                if (error) throw error;
                message(form, 'Nếu email có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Hãy kiểm tra cả thư mục spam.', true);
            } else if (form.dataset.authForm === 'update-password') {
                if (password !== String(fields.get('password_confirm') || '')) throw new Error('Hai mật khẩu chưa trùng khớp.');
                const { error } = await client.auth.updateUser({ password });
                if (error) throw error;
                message(form, 'Đã cập nhật mật khẩu. Đang mở bảng điều khiển…', true);
                location.assign('dashboard.php');
            }
        } catch (error) { message(form, errorMessage(error)); }
        finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
    }));
    document.querySelectorAll('[data-sign-out]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try { await signOut(); } catch (error) { showToast(errorMessage(error), true); button.disabled = false; }
    }));

    const ready = (async () => {
        try {
            if (!SmartLockerSupabase.isConfigured()) {
                if (protectedPage) { location.replace(loginUrl()); return; }
                forms.forEach(form => { message(form, 'Chưa cấu hình kết nối Supabase. Điền thông tin trong config/supabase.js theo README.md để đăng nhập.'); form.querySelector('button[type="submit"]')?.setAttribute('disabled', ''); });
                const status = document.querySelector('[data-auth-status]');
                if (status) status.textContent = 'Chưa cấu hình kết nối Supabase. Vui lòng làm theo README.md.';
                return;
            }
            const client = SmartLockerSupabase.getClient();
            const { data: sessionData, error: sessionError } = await client.auth.getSession();
            if (sessionError) throw sessionError;
            let user = null;
            if (sessionData.session) {
                const { data, error } = await client.auth.getUser();
                if (error) throw error;
                user = data.user;
            }
            if (protectedPage && !user) { location.replace(loginUrl()); return; }
            hydrateUser(user);
            document.body.classList.remove('auth-pending');
            if (user && forms.some(form => ['login', 'register'].includes(form.dataset.authForm))) { location.replace(nextPage()); return; }
            const callback = document.querySelector('[data-auth-callback]');
            if (callback) {
                const params = new URLSearchParams(location.search);
                const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
                const error = params.get('error_description') || hash.get('error_description');
                if (error) callback.textContent = 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập hoặc yêu cầu liên kết mới.';
                else if (user) location.replace('dashboard.php');
                else callback.textContent = 'Bạn có thể đăng nhập bằng email và mật khẩu sau khi hoàn tất xác nhận email.';
            }
            if (document.querySelector('[data-auth-logout]')) { await signOut(); return; }
            // Callback đồng bộ, không gọi API Auth lồng trong onAuthStateChange.
            client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' && protectedPage) location.replace(loginUrl());
                if (session?.user) hydrateUser(session.user);
            });
            return user;
        } catch (error) {
            if (protectedPage) { location.replace(loginUrl()); return; }
            forms.forEach(form => message(form, errorMessage(error)));
            const status = document.querySelector('[data-auth-status], [data-auth-callback]');
            if (status) status.textContent = errorMessage(error);
            return null;
        }
    })();
    return Object.freeze({ ready, nextPage, signOut });
})();
