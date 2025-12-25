/*
  # Daily Media Upload Limits

  Implements daily upload limits per user to prevent abuse:
  - 10 images per day
  - 1 video per day

  ## New Tables
  1. `daily_media_usage`
    - `user_id` (uuid, references auth.users)
    - `usage_date` (date, tracks usage by calendar day)
    - `image_count` (integer, images uploaded today)
    - `video_count` (integer, videos uploaded today)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## New Functions
  1. `check_daily_media_limit()` - Check if user can upload based on daily limits
  2. `increment_daily_media_usage()` - Increment usage counter after successful upload

  ## Changes
  - Add `media_type` column to `uploads` table
*/

-- Add media_type to uploads table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'media_type'
  ) THEN
    ALTER TABLE uploads ADD COLUMN media_type text CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;

-- Create daily_media_usage table
CREATE TABLE IF NOT EXISTS daily_media_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  image_count integer DEFAULT 0 NOT NULL CHECK (image_count >= 0),
  video_count integer DEFAULT 0 NOT NULL CHECK (video_count >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, usage_date)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_media_usage_user_date 
ON daily_media_usage(user_id, usage_date DESC);

-- Enable RLS
ALTER TABLE daily_media_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view own daily usage"
  ON daily_media_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage all (edge functions)
CREATE POLICY "Service role can manage daily usage"
  ON daily_media_usage FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Daily limits configuration
CREATE TABLE IF NOT EXISTS daily_media_limits (
  media_type text PRIMARY KEY CHECK (media_type IN ('image', 'video')),
  max_per_day integer NOT NULL CHECK (max_per_day > 0),
  description text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Insert default limits
INSERT INTO daily_media_limits (media_type, max_per_day, description) VALUES
  ('image', 10, 'Maximum 10 images per day'),
  ('video', 1, 'Maximum 1 video per day')
ON CONFLICT (media_type) DO NOTHING;

-- Function to check daily media limit
CREATE OR REPLACE FUNCTION check_daily_media_limit(
  p_user_id uuid,
  p_media_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_limit integer;
  v_current_count integer;
  v_usage_date date := CURRENT_DATE;
BEGIN
  -- Validate media_type
  IF p_media_type NOT IN ('image', 'video') THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'INVALID_MEDIA_TYPE',
      'message', 'Invalid media type. Must be image or video.'
    );
  END IF;

  -- Get daily limit for media type
  SELECT max_per_day INTO v_max_limit
  FROM daily_media_limits
  WHERE media_type = p_media_type;

  -- If no limit configured, allow (fail open)
  IF v_max_limit IS NULL THEN
    RETURN json_build_object(
      'allowed', true,
      'remaining', 999
    );
  END IF;

  -- Get current usage for today
  IF p_media_type = 'image' THEN
    SELECT COALESCE(image_count, 0) INTO v_current_count
    FROM daily_media_usage
    WHERE user_id = p_user_id
      AND usage_date = v_usage_date;
  ELSIF p_media_type = 'video' THEN
    SELECT COALESCE(video_count, 0) INTO v_current_count
    FROM daily_media_usage
    WHERE user_id = p_user_id
      AND usage_date = v_usage_date;
  END IF;

  -- Default to 0 if no record found
  v_current_count := COALESCE(v_current_count, 0);

  -- Check if limit exceeded
  IF v_current_count >= v_max_limit THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'DAILY_LIMIT_EXCEEDED',
      'message', format('Daily %s limit reached. You can upload %s more tomorrow.', p_media_type, v_max_limit),
      'current_count', v_current_count,
      'max_limit', v_max_limit
    );
  END IF;

  -- Allow upload
  RETURN json_build_object(
    'allowed', true,
    'remaining', v_max_limit - v_current_count,
    'current_count', v_current_count,
    'max_limit', v_max_limit
  );
END;
$$;

-- Function to increment daily media usage (called after successful finalize)
CREATE OR REPLACE FUNCTION increment_daily_media_usage(
  p_user_id uuid,
  p_media_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_usage_date date := CURRENT_DATE;
BEGIN
  -- Validate media_type
  IF p_media_type NOT IN ('image', 'video') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid media type'
    );
  END IF;

  -- Insert or update usage record
  IF p_media_type = 'image' THEN
    INSERT INTO daily_media_usage (user_id, usage_date, image_count, video_count)
    VALUES (p_user_id, v_usage_date, 1, 0)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET
      image_count = daily_media_usage.image_count + 1,
      updated_at = now();
  ELSIF p_media_type = 'video' THEN
    INSERT INTO daily_media_usage (user_id, usage_date, image_count, video_count)
    VALUES (p_user_id, v_usage_date, 0, 1)
    ON CONFLICT (user_id, usage_date)
    DO UPDATE SET
      video_count = daily_media_usage.video_count + 1,
      updated_at = now();
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Daily usage incremented'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_daily_media_limit TO authenticated;
GRANT EXECUTE ON FUNCTION check_daily_media_limit TO service_role;
GRANT EXECUTE ON FUNCTION increment_daily_media_usage TO authenticated;
GRANT EXECUTE ON FUNCTION increment_daily_media_usage TO service_role;

-- Comments
COMMENT ON TABLE daily_media_usage IS 'Track daily upload counts per user to enforce daily limits';
COMMENT ON TABLE daily_media_limits IS 'Configure maximum uploads per day by media type';
COMMENT ON FUNCTION check_daily_media_limit IS 'Check if user can upload based on daily limits';
COMMENT ON FUNCTION increment_daily_media_usage IS 'Increment daily usage counter after successful upload';
