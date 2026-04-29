-- Per-IP rate limiting (complements per-user rate limits)
-- Prevents bypass via multiple accounts from same IP

CREATE TABLE IF NOT EXISTS ip_rate_limits (
  ip_address  TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  window_end  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ip_address, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_window_end ON ip_rate_limits (window_end);

ALTER TABLE ip_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages ip rate limits"
    ON ip_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- IP rate limit config (separate from per-user limits, generally more permissive
-- since legitimate users from corporate/family networks share IPs)
CREATE TABLE IF NOT EXISTS ip_rate_limit_config (
  endpoint        TEXT PRIMARY KEY,
  max_requests    INTEGER NOT NULL,
  window_minutes  INTEGER NOT NULL DEFAULT 60,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ip_rate_limit_config (endpoint, max_requests, window_minutes, description) VALUES
  ('send-verification-email', 20,  60, 'Per-IP verification email limit (covers ~4 households)'),
  ('verify-email-code',       50,  60, 'Per-IP email code verify limit'),
  ('begin-upload',            300, 60, 'Per-IP upload start limit'),
  ('signup',                  10,  60, 'Per-IP signup attempts')
ON CONFLICT (endpoint) DO NOTHING;

CREATE OR REPLACE FUNCTION check_ip_rate_limit(p_ip TEXT, p_endpoint TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_requests   INTEGER;
  v_window_minutes INTEGER;
  v_count          INTEGER;
  v_window_end     TIMESTAMPTZ;
  v_now            TIMESTAMPTZ := NOW();
BEGIN
  -- Skip if no IP available (some clients won't have one)
  IF p_ip IS NULL OR p_ip = '' THEN
    RETURN json_build_object('allowed', true, 'reason', 'no_ip');
  END IF;

  SELECT max_requests, window_minutes
    INTO v_max_requests, v_window_minutes
  FROM ip_rate_limit_config
  WHERE endpoint = p_endpoint;

  IF v_max_requests IS NULL THEN
    RETURN json_build_object('allowed', true, 'reason', 'no_config');
  END IF;

  -- Get or create window
  SELECT count, window_end INTO v_count, v_window_end
  FROM ip_rate_limits
  WHERE ip_address = p_ip AND endpoint = p_endpoint;

  IF v_count IS NULL OR v_window_end < v_now THEN
    -- New window
    INSERT INTO ip_rate_limits (ip_address, endpoint, count, window_end)
    VALUES (p_ip, p_endpoint, 1, v_now + (v_window_minutes || ' minutes')::INTERVAL)
    ON CONFLICT (ip_address, endpoint) DO UPDATE SET
      count = 1,
      window_end = v_now + (v_window_minutes || ' minutes')::INTERVAL;
    RETURN json_build_object('allowed', true, 'remaining', v_max_requests - 1);
  END IF;

  IF v_count >= v_max_requests THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'IP_RATE_LIMIT_EXCEEDED',
      'message', 'Too many requests from this network. Please try again later.',
      'retry_after_seconds', EXTRACT(EPOCH FROM (v_window_end - v_now))::INTEGER
    );
  END IF;

  UPDATE ip_rate_limits
  SET count = count + 1
  WHERE ip_address = p_ip AND endpoint = p_endpoint;

  RETURN json_build_object('allowed', true, 'remaining', v_max_requests - v_count - 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION check_ip_rate_limit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_ip_rate_limit(TEXT, TEXT) TO service_role;
