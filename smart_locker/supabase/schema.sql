-- ==============================================================================
-- SMART LOCKER BUSINESS - SUPABASE POSTGRESQL SCHEMA (PHẦN NGỌC HIẾU)
-- Chạy toàn bộ file này trong: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Bảng hồ sơ người dùng (đồng bộ với Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    account_type TEXT NOT NULL DEFAULT 'user' CHECK (account_type IN ('user', 'company')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Bảng 9 ngăn tủ thông minh (lưu trạng thái vật lý + lệnh chờ cho ESP32)
CREATE TABLE IF NOT EXISTS public.lockers (
    id INT PRIMARY KEY,
    slot INT UNIQUE NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('COOL', 'NORMAL', 'THERMAL')),
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'ERROR')),
    current_temp NUMERIC(5,1) NOT NULL DEFAULT 25.0,
    target_temp NUMERIC(5,1) NOT NULL DEFAULT 25.0,
    humidity NUMERIC(5,1) NOT NULL DEFAULT 55.0,
    pwm_power INT NOT NULL DEFAULT 0 CHECK (pwm_power >= 0 AND pwm_power <= 100),
    door_locked BOOLEAN NOT NULL DEFAULT TRUE,
    has_item BOOLEAN NOT NULL DEFAULT FALSE,
    online BOOLEAN NOT NULL DEFAULT TRUE,
    active_category TEXT NULL,
    active_shipper_otp TEXT NULL,
    active_receiver_otp TEXT NULL,
    wrong_attempts INT NOT NULL DEFAULT 0,
    pending_cmd TEXT NULL,
    last_ping_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Khởi tạo sẵn 9 ngăn tủ (3x3) khớp với giao diện hiện có
INSERT INTO public.lockers (id, slot, code, type, status, current_temp, target_temp, online)
VALUES
    (1, 1, 'TỦ 01 (NGĂN NHIỆT)', 'COOL', 'AVAILABLE', 8.0, 8.0, TRUE),
    (2, 2, 'TỦ 02 (NGĂN THƯỜNG)', 'NORMAL', 'AVAILABLE', 25.5, 25.0, TRUE),
    (3, 3, 'TỦ 03 (NGĂN NHIỆT)', 'COOL', 'AVAILABLE', 5.5, 5.0, TRUE),
    (4, 4, 'TỦ 04 (NGĂN THƯỜNG)', 'NORMAL', 'AVAILABLE', 25.8, 25.0, TRUE),
    (5, 5, 'TỦ 05 (NGĂN NHIỆT)', 'COOL', 'AVAILABLE', 7.8, 8.0, TRUE),
    (6, 6, 'TỦ 06 (NGĂN THƯỜNG)', 'NORMAL', 'AVAILABLE', 25.6, 25.0, TRUE),
    (7, 7, 'TỦ 07 (NGĂN NHIỆT)', 'COOL', 'AVAILABLE', 5.2, 5.0, TRUE),
    (8, 8, 'TỦ 08 (NGĂN THƯỜNG)', 'NORMAL', 'AVAILABLE', 26.0, 25.0, TRUE),
    (9, 9, 'TỦ 09 (NGĂN NHIỆT)', 'COOL', 'AVAILABLE', 8.1, 8.0, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Bảng giao dịch gửi / nhận hàng
CREATE TABLE IF NOT EXISTS public.bookings (
    id BIGSERIAL PRIMARY KEY,
    locker_id INT NOT NULL REFERENCES public.lockers(id) ON DELETE CASCADE,
    slot INT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('FOOD', 'DRINK', 'HOT_FOOD', 'PARCEL')),
    target_temp NUMERIC(5,1) NOT NULL DEFAULT 25.0,
    sender_id UUID NULL,
    sender_email TEXT NOT NULL,
    sender_name TEXT NOT NULL DEFAULT '',
    recipient_email TEXT NOT NULL,
    shipper_otp TEXT NOT NULL,
    receiver_otp TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COLLECTED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    collected_at TIMESTAMPTZ NULL
);

-- 4. Bảng lịch sử cảm biến nhiệt ẩm (Time-series phục vụ biểu đồ & AI Thermal Anomaly)
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    locker_id INT NOT NULL REFERENCES public.lockers(id) ON DELETE CASCADE,
    current_temp NUMERIC(5,1) NOT NULL,
    target_temp NUMERIC(5,1) NOT NULL,
    humidity NUMERIC(5,1) NULL,
    pwm_power INT NOT NULL DEFAULT 0,
    door_locked BOOLEAN NOT NULL DEFAULT TRUE,
    has_item BOOLEAN NOT NULL DEFAULT FALSE,
    efficiency_score INT NOT NULL DEFAULT 100,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Bảng cảnh báo AI & Bảo mật (rò rỉ nhiệt, sai OTP >= 3 lần, mất kết nối)
CREATE TABLE IF NOT EXISTS public.alerts (
    id BIGSERIAL PRIMARY KEY,
    locker_id INT NOT NULL REFERENCES public.lockers(id) ON DELETE CASCADE,
    severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Bảng thành viên doanh nghiệp & phân quyền
CREATE TABLE IF NOT EXISTS public.company_members (
    id BIGSERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    member_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF' CHECK (role IN ('ADMIN', 'SHIPPER', 'STAFF')),
    status TEXT NOT NULL DEFAULT 'INVITED',
    invited_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_name, member_email)
);

-- 7. Bảng phiếu hỗ trợ
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NULL,
    user_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Bảng nhật ký kiểm toán bảo mật (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_email TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    locker_id INT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục tối ưu tốc độ truy vấn OTP và lịch sử nhiệt độ
CREATE INDEX IF NOT EXISTS idx_bookings_active_otp ON public.bookings (status, receiver_otp, shipper_otp);
CREATE INDEX IF NOT EXISTS idx_telemetry_locker_time ON public.telemetry_logs (locker_id, recorded_at DESC);

-- Bật Row Level Security (RLS) chuẩn doanh nghiệp:
-- Trình duyệt dùng anon/publishable key KHÔNG thể ghi bậy trực tiếp vào DB;
-- Mọi thao tác ghi đều đi qua PHP Backend (dùng SERVICE_ROLE_KEY sau khi xác thực JWT).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Cho phép người dùng đã đăng nhập đọc công khai trạng thái tủ (không lộ OTP vì PHP filter)
CREATE POLICY "Authenticated read lockers" ON public.lockers
    FOR SELECT TO authenticated USING (true);
