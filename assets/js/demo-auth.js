// Hỗ trợ phiên Demo cục bộ (chỉ hoạt động khi backend bật LOCAL_DEMO_FALLBACK).
// Khi người dùng đăng nhập bằng Supabase thật, module này không can thiệp.
(() => {
    const DEMO_TOKEN_KEY = 'smart_locker_demo_token';
    const DEMO_USERS = {
        'demo-token-admin': {
            id: 'demo-admin-uuid',
            email: 'admin@smartlocker.demo',
            user_metadata: {
                full_name: 'Quản trị Demo',
                company_name: 'Smart Locker Demo Co.',
                account_type: 'company',
            },
        },
        'demo-token-shipper': {
            id: 'demo-shipper-uuid',
            email: 'shipper@smartlocker.demo',
            user_metadata: {
                full_name: 'Shipper Demo',
                company_name: 'Smart Locker Demo Co.',
                account_type: 'user',
            },
        },
        'demo-token-user': {
            id: 'demo-user-uuid',
            email: 'nhanvien@smartlocker.demo',
            user_metadata: {
                full_name: 'Nhân viên Demo',
                company_name: 'Smart Locker Demo Co.',
                account_type: 'user',
            },
        },
    };

    window.SmartLockerDemoAuth = {
        getToken() {
            try { return localStorage.getItem(DEMO_TOKEN_KEY) || ''; } catch (_) { return ''; }
        },
        async login(role = 'admin') {
            const token = role === 'admin'
                ? 'demo-token-admin'
                : (role === 'shipper' ? 'demo-token-shipper' : 'demo-token-user');
            try {
                const res = await fetch('api.php?action=health');
                const health = await res.json();
                if (!health?.demo_mode) {
                    throw new Error('Máy chủ đang chạy Supabase thật (demo_mode=false), vui lòng đăng nhập bằng tài khoản Supabase.');
                }
            } catch (err) {
                if (err?.message?.includes('Supabase thật')) throw err;
            }
            localStorage.setItem(DEMO_TOKEN_KEY, token);
            const user = DEMO_USERS[token];
            const isCompany = user.user_metadata.account_type === 'company';
            localStorage.setItem('smart_locker_session_hint', JSON.stringify({
                name: user.user_metadata.full_name,
                email: user.email,
                initials: isCompany ? 'QT' : (role === 'shipper' ? 'SP' : 'NV'),
                accountType: user.user_metadata.account_type,
                company: user.user_metadata.company_name,
            }));
            return user;
        },
        clear() {
            try {
                localStorage.removeItem(DEMO_TOKEN_KEY);
                localStorage.removeItem('smart_locker_admin_email');
                sessionStorage.removeItem('smart_locker_auth_cache_v1');
                sessionStorage.removeItem('smart_locker_cache_v1');
            } catch (_) {}
        },
    };

    // Nếu đang có demo token trong localStorage, bọc nhẹ Supabase client để auth.js nhận diện phiên
    const activeToken = window.SmartLockerDemoAuth.getToken();
    if (activeToken && DEMO_USERS[activeToken] && window.SmartLockerSupabase?.getClient) {
        const origGetClient = window.SmartLockerSupabase.getClient.bind(window.SmartLockerSupabase);
        window.SmartLockerSupabase.getClient = () => {
            const demoUser = DEMO_USERS[activeToken];
            const demoSession = { access_token: activeToken, user: demoUser };
            return {
                auth: {
                    async getSession() { return { data: { session: demoSession }, error: null }; },
                    async getUser() { return { data: { user: demoUser }, error: null }; },
                    async updateUser({ data }) {
                        Object.assign(demoUser.user_metadata, data || {});
                        return { data: { user: demoUser }, error: null };
                    },
                    async signOut() {
                        window.SmartLockerDemoAuth.clear();
                        try { await origGetClient().auth.signOut({ scope: 'local' }); } catch (_) {}
                        return { error: null };
                    },
                    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
                },
            };
        };
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const box = document.getElementById('demo-quick-login-box');
        if (!box) return;
        try {
            const res = await fetch('api.php?action=health');
            const health = await res.json();
            if (!health?.demo_mode) return;
            box.hidden = false;
            box.querySelectorAll('[data-demo-login]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    try {
                        await window.SmartLockerDemoAuth.login(btn.dataset.demoLogin);
                        const next = new URLSearchParams(location.search).get('next');
                        location.assign(next || (btn.dataset.demoLogin === 'admin' ? 'admin.php' : 'lockers.php'));
                    } catch (err) {
                        window.showToast?.(err.message || 'Không đăng nhập demo được.', true);
                        btn.disabled = false;
                    }
                });
            });
        } catch (_) {}
    });
})();
