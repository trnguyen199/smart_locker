// Chỉ khởi tạo Supabase Auth. Chưa truy vấn bảng, RPC hoặc Edge Functions.
window.SmartLockerSupabase = (() => {
    let client;
    function isConfigured() {
        const config = window.SMART_LOCKER_SUPABASE;
        return Boolean(config && typeof config.url === 'string' && /^https?:\/\//.test(config.url)
            && !config.url.includes('YOUR_PROJECT') && typeof config.publishableKey === 'string'
            && config.publishableKey.trim() && !config.publishableKey.includes('YOUR_PUBLIC_KEY'));
    }
    function getClient() {
        if (!isConfigured()) throw new Error('Hệ thống đăng nhập chưa được cấu hình. Vui lòng xem hướng dẫn kết nối Supabase trong README.md.');
        if (!window.supabase?.createClient) throw new Error('Không tải được thư viện đăng nhập. Kiểm tra kết nối Internet rồi tải lại trang.');
        if (!client) {
            const config = window.SMART_LOCKER_SUPABASE;
            if (config.publishableKey.startsWith('sb_secret_')) throw new Error('Cấu hình trình duyệt cần Publishable key, không dùng Secret key.');
            client = window.supabase.createClient(config.url, config.publishableKey, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
            });
        }
        return client;
    }
    return Object.freeze({ isConfigured, getClient });
})();
