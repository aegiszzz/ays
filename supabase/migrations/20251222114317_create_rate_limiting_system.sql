/*
  # Rate Limiting and Abuse Protection System

  Implements user-level rate limiting to prevent abuse and protect system resources.

  ## Rate Limits
  - begin-upload: 100 requests/hour per user
  - finalize-upload: 100 requests/hour per user (same as begin)
  - feed queries: 1000 requests/hour per user
  - thumbnail processing: 50 requests/hour per user

  ## Account Freeze
  - Automatic freeze if suspicious activity detected
  - Manual freeze by admins
  - Revoke access to all endpoints while frozen

  ## Tables
  1. rate_limits: Track request counts per user/endpoint
  2. account_status: Track account freeze status

  ## Functions
  1. check_rate_limit(): Check if user is within rate limit
  2. freeze_account(): Freeze account (manual or automatic)
  3. unfreeze_account(): Restore account access
*/

-- Create account_status table
CREATE TABLE IF NOT EXISTS account_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_frozen boolean DEFAULT false NOT NULL,
  freeze_reason text,
  frozen_at timestamptz,
  frozen_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE account_status ENABLE ROW LEVEL SECURITY;

-- Users can view own account status
CREATE POLICY "Users can view own account status"
  ON account_status FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only admins can modify account status
CREATE POLICY "Admins can update account status"
  ON account_status FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Create rate_limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  request_count integer DEFAULT 1 NOT NULL,
  window_start timestamptz DEFAULT now() NOT NULL,
  window_end timestamptz DEFAULT (now() + INTERVAL '1 hour') NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Composite index for rate limit checks (without filter)
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint_window 
ON rate_limits(user_id, endpoint, window_end DESC);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role only (internal use)
CREATE POLICY "Service role can manage rate limits"
  ON rate_limits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Rate limit configuration
CREATE TABLE IF NOT EXISTS rate_limit_config (
  endpoint text PRIMARY KEY,
  max_requests integer NOT NULL,
  window_minutes integer DEFAULT 60 NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Insert default rate limits
INSERT INTO rate_limit_config (endpoint, max_requests, window_minutes, description) VALUES
  ('begin-upload', 100, 60, 'Upload initiation limit'),
  ('finalize-upload', 100, 60, 'Upload finalization limit'),
  ('feed', 1000, 60, 'Feed query limit'),
  ('process-thumbnail', 50, 60, 'Thumbnail processing limit'),
  ('get-storage-summary', 100, 60, 'Storage summary query limit')
ON CONFLICT (endpoint) DO NOTHING;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_endpoint text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_requests integer;
  v_window_minutes integer;
  v_current_count integer;
  v_is_frozen boolean;
  v_limit_record record;
BEGIN
  -- Check if account is frozen
  SELECT is_frozen INTO v_is_frozen
  FROM account_status
  WHERE user_id = p_user_id;

  IF v_is_frozen THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'ACCOUNT_FROZEN',
      'message', 'Account is frozen. Contact support.'
    );
  END IF;

  -- Get rate limit config
  SELECT max_requests, window_minutes
  INTO v_max_requests, v_window_minutes
  FROM rate_limit_config
  WHERE endpoint = p_endpoint;

  -- If no config, allow (fail open)
  IF v_max_requests IS NULL THEN
    RETURN json_build_object(
      'allowed', true,
      'remaining', 999
    );
  END IF;

  -- Get or create rate limit record
  SELECT *
  INTO v_limit_record
  FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_end > now()
  ORDER BY window_end DESC
  LIMIT 1;

  -- No active window, create new one
  IF v_limit_record IS NULL THEN
    INSERT INTO rate_limits (user_id, endpoint, request_count, window_start, window_end)
    VALUES (
      p_user_id,
      p_endpoint,
      1,
      now(),
      now() + (v_window_minutes || ' minutes')::interval
    );

    RETURN json_build_object(
      'allowed', true,
      'remaining', v_max_requests - 1
    );
  END IF;

  v_current_count := v_limit_record.request_count;

  -- Check if limit exceeded
  IF v_current_count >= v_max_requests THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'RATE_LIMIT_EXCEEDED',
      'message', 'Too many requests. Try again later.',
      'retry_after', EXTRACT(EPOCH FROM (v_limit_record.window_end - now()))
    );
  END IF;

  -- Increment counter
  UPDATE rate_limits
  SET
    request_count = request_count + 1,
    updated_at = now()
  WHERE id = v_limit_record.id;

  RETURN json_build_object(
    'allowed', true,
    'remaining', v_max_requests - v_current_count - 1
  );
END;
$$;

-- Function to freeze account
CREATE OR REPLACE FUNCTION freeze_account(
  p_user_id uuid,
  p_reason text,
  p_frozen_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert or update account status
  INSERT INTO account_status (user_id, is_frozen, freeze_reason, frozen_at, frozen_by)
  VALUES (p_user_id, true, p_reason, now(), p_frozen_by)
  ON CONFLICT (user_id)
  DO UPDATE SET
    is_frozen = true,
    freeze_reason = p_reason,
    frozen_at = now(),
    frozen_by = p_frozen_by,
    updated_at = now();

  RETURN json_build_object(
    'success', true,
    'message', 'Account frozen'
  );
END;
$$;

-- Function to unfreeze account
CREATE OR REPLACE FUNCTION unfreeze_account(
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE account_status
  SET
    is_frozen = false,
    freeze_reason = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Account unfrozen'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION freeze_account TO authenticated;
GRANT EXECUTE ON FUNCTION freeze_account TO service_role;
GRANT EXECUTE ON FUNCTION unfreeze_account TO authenticated;
GRANT EXECUTE ON FUNCTION unfreeze_account TO service_role;

-- Comments
COMMENT ON TABLE account_status IS 'Track account freeze status for abuse prevention';
COMMENT ON TABLE rate_limits IS 'Track request counts per user/endpoint for rate limiting';
COMMENT ON TABLE rate_limit_config IS 'Configure rate limits per endpoint';
COMMENT ON FUNCTION check_rate_limit IS 'Check if user is within rate limit for endpoint';
COMMENT ON FUNCTION freeze_account IS 'Freeze account due to abuse or suspicious activity';
COMMENT ON FUNCTION unfreeze_account IS 'Restore account access';
