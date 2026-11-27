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
    const HINT_KEY = 'smart_locker_session_hint';
    function saveSessionHint(payload) {
        try {
            if (typeof localStorage === 'undefined') return;
            if (!payload) {
                localStorage.removeItem(HINT_KEY);
                localStorage.removeItem('smart_locker_admin_email');
                try {
                    sessionStorage.removeItem('smart_locker_auth_cache_v1');
                    sessionStorage.removeItem('smart_locker_cache_v1');
                } catch (_) {}
            } else {
                const prev = JSON.parse(localStorage.getItem(HINT_KEY) || 'null');
                const merged = {
                    ...(prev && typeof prev === 'object' ? prev : {}),
                    ...payload,
                };
                if (payload.accountType === 'company') merged.hasLockerAccess = true;
                localStorage.setItem(HINT_KEY, JSON.stringify(merged));
            }
        } catch (_) {}
    }
    function isConfirmedBackendAdmin(user) {
        try {
            if (typeof localStorage === 'undefined' || !user?.email) return false;
            return localStorage.getItem('smart_locker_admin_email') === String(user.email).toLowerCase();
        } catch (_) { return false; }
    }
    function resolveAccountType(user) {
        const metadata = user?.user_metadata || {};
        if (metadata.account_type === 'company' || metadata.account_type === 'user') return metadata.account_type;
        return typeof metadata.company_name === 'string' && metadata.company_name.trim() ? 'company' : 'user';
    }
    function hydrateUser(user) {
        const metadata = user?.user_metadata || {};
        const fullName = typeof metadata.full_name === 'string' ? metadata.full_name : '';
        const fallbackName = typeof metadata.name === 'string' ? metadata.name : '';
        const name = fullName.trim() || fallbackName.trim() || user?.email?.split('@')[0] || 'Bạn';
        const resolvedType = user ? resolveAccountType(user) : 'user';
        const accountType = (user && (resolvedType === 'company' || isConfirmedBackendAdmin(user))) ? 'company' : resolvedType;
        const isCompany = Boolean(user && accountType === 'company');
        const company = typeof metadata.company_name === 'string' ? metadata.company_name.trim() : '';
        const companyDisplay = company || (isCompany ? 'Không gian doanh nghiệp' : 'Chưa liên kết công ty');
        const workspaceLabel = isCompany ? companyDisplay : 'Không gian người dùng';
        const workspaceRole = isCompany ? 'Không gian doanh nghiệp · Quản trị' : (company ? 'Thành viên · ' + company : 'Tài khoản cá nhân');
        const words = name.trim().split(/\s+/u);
        const initials = ((words[0]?.[0] || 'S') + (words.length > 1 ? words.at(-1)[0] : '')).toUpperCase();
        saveSessionHint(user ? { name, email: user.email || '', initials, accountType, company } : null);
        for (const [selector, text] of [
            ['[data-user-name]', name],
            ['[data-user-email]', user?.email || ''],
            ['[data-user-initials]', initials],
            ['[data-company-name]', companyDisplay],
            ['[data-workspace-label]', workspaceLabel],
            ['[data-workspace-role]', workspaceRole],
            ['[data-workspace-crumb]', isCompany ? 'Không gian doanh nghiệp' : 'Không gian người dùng'],
            ['[data-account-type-label]', isCompany ? 'Doanh nghiệp (Quản trị)' : 'Người dùng'],
            ['[data-workspace-panel-title]', isCompany ? 'Không gian doanh nghiệp' : 'Không gian người dùng'],
        ]) {
            document.querySelectorAll(selector).forEach(element => { if (element.matches('input')) element.value = text; else element.textContent = text; });
        }
        document.querySelectorAll('[data-user-only]').forEach(element => { element.hidden = !user; });
        document.querySelectorAll('[data-guest-only]').forEach(element => { element.hidden = Boolean(user); });
        document.querySelectorAll('[data-company-only]').forEach(element => { element.hidden = !isCompany; });
        document.querySelectorAll('[data-personal-only]').forEach(element => { element.hidden = !user || isCompany; });
        if (document.body?.dataset) {
            document.body.dataset.accountType = user ? accountType : '';
            if (user) document.body.dataset.authHint = '1';
            else delete document.body.dataset.authHint;
        }
        if (user && document.body.dataset.activePage === 'dashboard') {
            const heading = document.querySelector('.page-heading h1');
            if (heading) heading.textContent = 'Chào ' + name + ', một ngày tốt lành!';
            const eyebrow = document.querySelector('.page-heading .eyebrow');
            if (eyebrow) eyebrow.textContent = isCompany ? 'KHÔNG GIAN DOANH NGHIỆP' : 'KHÔNG GIAN NGƯỜI DÙNG';
        }
    }
    function setupAuthTabs() {
        const tabs = [...document.querySelectorAll('[data-auth-tab]')];
        const form = forms[0];
        if (!tabs.length || !form) return;
        const mode = form.dataset.authForm;
        const card = form.closest('.auth-card') || document;
        const setTab = type => {
            const isCompany = type === 'company';
            tabs.forEach(tab => {
                const active = tab.dataset.authTab === type;
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-selected', String(active));
            });
            message(form, '');
            const titleEl = card.querySelector('[data-auth-title]');
            const subtitleEl = card.querySelector('[data-auth-subtitle]');
            const submitEl = card.querySelector('[data-auth-submit-label]');
            const bottomEl = card.querySelector('[data-auth-bottom]');
            const altEl = card.querySelector('[data-auth-alt]');
            if (mode === 'register') {
                const typeInput = form.querySelector('input[name="account_type"]');
                if (typeInput) typeInput.value = type;
                const companyInput = form.querySelector('#company-name');
                const companyLabel = form.querySelector('[data-company-label]');
                const companyHelp = form.querySelector('[data-company-help]');
                const nameLabel = form.querySelector('[data-name-label]');
                const emailLabel = form.querySelector('label[for="email"]');
                if (titleEl) titleEl.textContent = isCompany ? 'Đăng ký không gian công ty' : 'Đăng ký tài khoản người dùng';
                if (subtitleEl) subtitleEl.textContent = isCompany
                    ? 'Tạo không gian doanh nghiệp và tài khoản quản trị viên đầu tiên.'
                    : 'Tạo tài khoản cá nhân hoặc nhân viên để gửi và nhận kiện hàng.';
                if (submitEl) submitEl.textContent = isCompany ? 'Đăng ký cho công ty' : 'Đăng ký tài khoản người dùng';
                if (companyLabel) companyLabel.textContent = isCompany ? 'Tên công ty / Doanh nghiệp' : 'Tên công ty (không bắt buộc)';
                if (companyInput) {
                    companyInput.required = isCompany;
                    companyInput.placeholder = isCompany ? 'Công ty TNHH Smart Locker' : 'Bỏ trống nếu dùng cá nhân';
                }
                if (companyHelp) companyHelp.textContent = isCompany
                    ? 'Tên công ty sẽ được dùng để tạo không gian doanh nghiệp.'
                    : 'Nhập tên công ty nếu bạn là nhân viên thuộc doanh nghiệp.';
                if (nameLabel) nameLabel.textContent = isCompany ? 'Họ và tên người quản trị' : 'Họ và tên';
                if (emailLabel) emailLabel.textContent = isCompany ? 'Email doanh nghiệp' : 'Email';
                if (bottomEl) bottomEl.innerHTML = 'Đã có tài khoản? <a href="login.php?type=' + (isCompany ? 'company' : 'user') + '">Đăng nhập ngay</a>';
            } else if (mode === 'login') {
                const loginInput = form.querySelector('input[name="login_type"]');
                if (loginInput) loginInput.value = type;
                if (titleEl) titleEl.textContent = isCompany ? 'Đăng nhập doanh nghiệp' : 'Đăng nhập người dùng';
                if (subtitleEl) subtitleEl.textContent = isCompany
                    ? 'Truy cập không gian doanh nghiệp để quản lý hệ thống tủ và thành viên.'
                    : 'Vào không gian người dùng để gửi, nhận hàng bằng OTP và xem lịch sử.';
                if (submitEl) submitEl.textContent = isCompany ? 'Đăng nhập doanh nghiệp' : 'Đăng nhập người dùng';
                if (bottomEl) bottomEl.innerHTML = isCompany
                    ? 'Chưa có không gian doanh nghiệp? <a href="register.php?type=company">Đăng ký cho công ty</a>'
                    : 'Chưa có tài khoản người dùng? <a href="register.php?type=user">Đăng ký người dùng</a>';
                if (altEl) altEl.innerHTML = isCompany
                    ? 'Bạn là cá nhân / nhân viên? <a href="login.php?type=user">Đăng nhập người dùng</a>'
                    : 'Bạn đại diện doanh nghiệp? <a href="register.php?type=company">Đăng ký cho công ty</a>';
            }
        };
        tabs.forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.authTab)));
    }
    async function signOut() {
        const { error } = await SmartLockerSupabase.getClient().auth.signOut({ scope: 'local' });
        if (error) throw error;
        saveSessionHint(null);
        location.replace('login.php');
    }

    setupAuthTabs();
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
                if (data.user || data.session.user) hydrateUser(data.user || data.session.user);
                location.assign(nextPage());
            } else if (form.dataset.authForm === 'register') {
                const rawType = String(fields.get('account_type') || '').trim();
                const accountType = rawType === 'user' ? 'user' : 'company';
                const companyName = String(fields.get('company_name') || '').trim();
                if (accountType === 'company' && !companyName) {
                    throw new Error('Vui lòng nhập tên công ty để đăng ký không gian doanh nghiệp.');
                }
                const { data, error } = await client.auth.signUp({ email, password, options: {
                    data: { full_name: String(fields.get('name') || '').trim(), company_name: companyName, account_type: accountType },
                    emailRedirectTo: new URL('auth-callback.php', location.href).href,
                } });
                if (error) throw error;
                if (data.session) {
                    if (data.user || data.session.user) hydrateUser(data.user || data.session.user);
                    location.assign('dashboard.php');
                }
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
            if (sessionData.session?.user && !forms.some(form => ['login', 'register'].includes(form.dataset.authForm))) {
                hydrateUser(sessionData.session.user);
                document.body.classList.remove('auth-pending');
            }
            if (sessionData.session) {
                if (sessionData.session.user) {
                    // Đã có phiên cục bộ: mở giao diện ngay, đồng thời xác thực ngầm token với máy chủ
                    user = sessionData.session.user;
                    Promise.resolve(client.auth.getUser()).then(({ data, error }) => {
                        if (error || !data?.user) {
                            saveSessionHint(null);
                            if (protectedPage) location.replace(loginUrl());
                            return;
                        }
                        hydrateUser(data.user);
                    }).catch(() => {});
                } else {
                    const { data, error } = await client.auth.getUser();
                    if (error) throw error;
                    user = data.user;
                }
            }
            if (protectedPage && !user) { saveSessionHint(null); location.replace(loginUrl()); return; }
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
                if (event === 'SIGNED_OUT') {
                    saveSessionHint(null);
                    if (protectedPage) location.replace(loginUrl());
                }
                if (session?.user) hydrateUser(session.user);
            });
            return user;
        } catch (error) {
            saveSessionHint(null);
            if (protectedPage) { location.replace(loginUrl()); return; }
            forms.forEach(form => message(form, errorMessage(error)));
            const status = document.querySelector('[data-auth-status], [data-auth-callback]');
            if (status) status.textContent = errorMessage(error);
            return null;
        }
    })();
    return Object.freeze({ ready, nextPage, signOut, resolveAccountType });
})();
