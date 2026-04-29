-- Admin audit log table for tracking all admin actions
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  target_type TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only admins (via service role) can insert; nobody can update/delete
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only insert"
  ON admin_audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admins can view logs"
  ON admin_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

-- Register send-verification-email endpoint in rate limiting config
INSERT INTO rate_limit_config (endpoint, max_requests, window_minutes, description)
VALUES ('send-verification-email', 5, 60, 'Verification email send limit')
ON CONFLICT (endpoint) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs (created_at DESC);
