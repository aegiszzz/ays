-- 1. Add total_count column to daily_media_usage for combined tracking
ALTER TABLE daily_media_usage ADD COLUMN IF NOT EXISTS total_count INTEGER NOT NULL DEFAULT 0;

-- 2. Weekly media usage tracking
CREATE TABLE IF NOT EXISTS weekly_media_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE weekly_media_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users view own weekly usage"
    ON weekly_media_usage FOR SELECT USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages weekly usage"
    ON weekly_media_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Combined upload limit check (daily: 3, weekly: 10)
CREATE OR REPLACE FUNCTION check_combined_upload_limits(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_total  INTEGER;
  v_weekly_total INTEGER;
  v_daily_limit  CONSTANT INTEGER := 3;
  v_weekly_limit CONSTANT INTEGER := 10;
  v_today        DATE := CURRENT_DATE;
  v_week_start   DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE;
BEGIN
  SELECT COALESCE(total_count, 0) INTO v_daily_total
  FROM daily_media_usage
  WHERE user_id = p_user_id AND usage_date = v_today;

  v_daily_total := COALESCE(v_daily_total, 0);

  IF v_daily_total >= v_daily_limit THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'DAILY_LIMIT_EXCEEDED',
      'message', format('Daily upload limit reached (%s/day). Come back tomorrow!', v_daily_limit),
      'daily_count', v_daily_total,
      'daily_limit', v_daily_limit
    );
  END IF;

  SELECT COALESCE(total_count, 0) INTO v_weekly_total
  FROM weekly_media_usage
  WHERE user_id = p_user_id AND week_start = v_week_start;

  v_weekly_total := COALESCE(v_weekly_total, 0);

  IF v_weekly_total >= v_weekly_limit THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'WEEKLY_LIMIT_EXCEEDED',
      'message', format('Weekly upload limit reached (%s/week). Come back next Monday!', v_weekly_limit),
      'weekly_count', v_weekly_total,
      'weekly_limit', v_weekly_limit
    );
  END IF;

  RETURN json_build_object(
    'allowed', true,
    'daily_remaining',  v_daily_limit  - v_daily_total,
    'weekly_remaining', v_weekly_limit - v_weekly_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION check_combined_upload_limits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_combined_upload_limits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_combined_upload_limits(UUID) TO service_role;

-- 4. Update increment_daily_media_usage to also track combined totals
CREATE OR REPLACE FUNCTION increment_daily_media_usage(p_user_id UUID, p_media_type TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today      DATE := CURRENT_DATE;
  v_week_start DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE;
BEGIN
  IF p_media_type NOT IN ('image', 'video') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid media type');
  END IF;

  IF p_media_type = 'image' THEN
    INSERT INTO daily_media_usage (user_id, usage_date, image_count, video_count, total_count)
    VALUES (p_user_id, v_today, 1, 0, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
      image_count = daily_media_usage.image_count + 1,
      total_count = daily_media_usage.total_count + 1,
      updated_at  = NOW();
  ELSE
    INSERT INTO daily_media_usage (user_id, usage_date, image_count, video_count, total_count)
    VALUES (p_user_id, v_today, 0, 1, 1)
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
      video_count = daily_media_usage.video_count + 1,
      total_count = daily_media_usage.total_count + 1,
      updated_at  = NOW();
  END IF;

  INSERT INTO weekly_media_usage (user_id, week_start, total_count)
  VALUES (p_user_id, v_week_start, 1)
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    total_count = weekly_media_usage.total_count + 1,
    updated_at  = NOW();

  RETURN json_build_object('success', true);
END;
$$;

-- 5. Update tasks to new balanced values
UPDATE tasks SET points = 5,  required_count = 1  WHERE action_type = 'daily_checkin';
UPDATE tasks SET points = 10, required_count = 1  WHERE action_type = 'upload_media';
UPDATE tasks SET points = 3,  required_count = 3  WHERE action_type = 'share_content';
UPDATE tasks SET points = 25, required_count = 1  WHERE action_type = 'first_upload';
UPDATE tasks SET points = 40, required_count = 30 WHERE action_type = 'like_posts';
UPDATE tasks SET points = 50, required_count = 7  WHERE action_type = 'weekly_uploads';

-- Add "Like Posts" daily task (3 likes/day = 3 pts)
INSERT INTO tasks (title, description, points, task_type, action_type, required_count, icon)
VALUES ('Like 3 Posts', 'Like 3 posts today', 3, 'daily', 'daily_likes', 3, '❤️')
ON CONFLICT DO NOTHING;

-- Add "Complete Profile" one-time task
INSERT INTO tasks (title, description, points, task_type, action_type, required_count, icon)
VALUES ('Complete Profile', 'Add a bio and profile photo', 15, 'one_time', 'complete_profile', 1, '👤')
ON CONFLICT DO NOTHING;
