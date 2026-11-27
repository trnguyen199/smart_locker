BEGIN;

-- Không cho trình duyệt đọc trực tiếp lockers vì bản ghi chứa OTP đang hoạt động.
DROP POLICY IF EXISTS "Authenticated read lockers" ON public.lockers;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.lockers FROM anon, authenticated;
REVOKE ALL ON TABLE public.bookings FROM anon, authenticated;
REVOKE ALL ON TABLE public.telemetry_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.alerts FROM anon, authenticated;
REVOKE ALL ON TABLE public.company_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.support_tickets FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_one_active_per_locker
    ON public.bookings (locker_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_shipper_otp
    ON public.bookings (shipper_otp) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_receiver_otp
    ON public.bookings (receiver_otp) WHERE status = 'ACTIVE';

COMMIT;
