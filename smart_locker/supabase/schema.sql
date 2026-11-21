-- ==============================================================================
-- SMART LOCKER BUSINESS — SUPABASE POSTGRESQL SCHEMA (PHẦN NGỌC HIẾU)
-- 100% Idempotent: An toàn chạy lại nhiều lần trong Supabase SQL Editor
-- (tuyệt đối không gặp lỗi trùng bảng hoặc lỗi trùng policy 42710).
-- ==============================================================================

-- 1. Hồ sơ người dùng (đồng bộ với Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    account_type TEXT NOT NULL DEFAULT 'user' CHECK (account_type IN ('user', 'company')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Danh sách 9 ngăn tủ (vòng đời đầy đủ: AVAILABLE -> WAITING_DROP -> OPEN -> OCCUPIED -> LOCKOUT/ERROR)
CREATE TABLE IF NOT EXISTS public.lockers (
    id INT PRIMARY KEY,
    slot INT UNIQUE NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('COOL', 'NORMAL', 'THERMAL')),
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
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
    lockout_until TIMESTAMPTZ NULL,
    pending_cmd TEXT NULL,
    last_ping_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lockers ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ NULL;
ALTER TABLE public.lockers DROP CONSTRAINT IF EXISTS lockers_status_check;
ALTER TABLE public.lockers ADD CONSTRAINT lockers_status_check
    CHECK (status IN ('AVAILABLE', 'WAITING_DROP', 'OPEN', 'OCCUPIED', 'LOCKOUT', 'ERROR'));

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

-- 3. Giao dịch gửi / nhận hàng (vòng đời OTP: chưa dùng / đã dùng / quá hạn EXPIRED)
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
    shipper_otp_used_at TIMESTAMPTZ NULL,
    receiver_otp_used_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    collected_at TIMESTAMPTZ NULL
);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shipper_otp_used_at TIMESTAMPTZ NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS receiver_otp_used_at TIMESTAMPTZ NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('ACTIVE', 'COLLECTED', 'CANCELLED', 'EXPIRED'));

-- 4. Lịch sử cảm biến nhiệt ẩm (Time-series cho biểu đồ & phân tích AI nhiệt học)
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

-- 5. Cảnh báo vận hành & bảo mật (rò rỉ nhiệt, sai OTP >= 3 lần, quá hạn, mở trái phép)
CREATE TABLE IF NOT EXISTS public.alerts (
    id BIGSERIAL PRIMARY KEY,
    locker_id INT NOT NULL REFERENCES public.lockers(id) ON DELETE CASCADE,
    severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Thành viên doanh nghiệp & phân quyền (ADMIN, SHIPPER, STAFF)
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

-- 7. Phiếu yêu cầu hỗ trợ
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

-- 8. Nhật ký kiểm toán bảo mật (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_email TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    locker_id INT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục tối ưu truy vấn OTP, hết hạn và lịch sử nhiệt độ
CREATE INDEX IF NOT EXISTS idx_bookings_active_otp ON public.bookings (status, receiver_otp, shipper_otp);
CREATE INDEX IF NOT EXISTS idx_bookings_expires_at ON public.bookings (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_locker_time ON public.telemetry_logs (locker_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON public.audit_logs (action, actor_email, created_at DESC);

-- Bật Row Level Security (RLS). Mọi dữ liệu nghiệp vụ chỉ đi qua PHP Backend;
-- trình duyệt không được SELECT trực tiếp vì bảng lockers có trạng thái nội bộ và OTP đang hoạt động.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lockers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read lockers" ON public.lockers;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.lockers FROM anon, authenticated;
REVOKE ALL ON TABLE public.bookings FROM anon, authenticated;
REVOKE ALL ON TABLE public.telemetry_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.alerts FROM anon, authenticated;
REVOKE ALL ON TABLE public.company_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_tickets FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;

-- Chặn hai đơn ACTIVE trên cùng tủ và giảm nguy cơ trùng OTP đang còn hiệu lực.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_one_active_per_locker
    ON public.bookings (locker_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_shipper_otp
    ON public.bookings (shipper_otp) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_receiver_otp
    ON public.bookings (receiver_otp) WHERE status = 'ACTIVE';
