-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1,
  task_type TEXT NOT NULL CHECK (task_type IN ('daily', 'weekly', 'one_time')),
  action_type TEXT NOT NULL,
  required_count INTEGER NOT NULL DEFAULT 1,
  icon TEXT NOT NULL DEFAULT '⭐',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User task progress / completions
CREATE TABLE IF NOT EXISTS user_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  current_count INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_tasks_user_id ON user_tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_task_id ON user_tasks (task_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_completed_at ON user_tasks (completed_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_total_points ON users (total_points DESC);

CREATE OR REPLACE FUNCTION increment_user_points(p_user_id UUID, p_points INTEGER)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new_total INTEGER;
BEGIN
  UPDATE users SET total_points = total_points + p_points WHERE id = p_user_id RETURNING total_points INTO v_new_total;
  RETURN v_new_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_user_points(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_user_points(UUID, INTEGER) TO authenticated;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can view active tasks" ON tasks FOR SELECT USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage tasks" ON tasks FOR ALL
    USING (EXISTS (SELECT 1 FROM users WHERE id = (SELECT auth.uid()) AND is_admin = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users view own task progress" ON user_tasks FOR SELECT USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users insert own task progress" ON user_tasks FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users update own task progress" ON user_tasks FOR UPDATE USING (user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO tasks (title, description, points, task_type, action_type, required_count, icon) VALUES
  ('Daily Check-In',     'Check in once per day to earn a point',             1,  'daily',    'daily_checkin',  1,  '📅'),
  ('Upload Media',       'Upload a photo or video',                           5,  'daily',    'upload_media',   1,  '📸'),
  ('Share Content',      'Share a post',                                      3,  'daily',    'share_content',  1,  '🔗'),
  ('First Upload',       'Upload your first piece of media (one-time bonus)', 10, 'one_time', 'first_upload',   1,  '🚀'),
  ('Like 10 Posts',      'Like 10 posts this week',                           25, 'weekly',   'like_posts',     10, '❤️'),
  ('Upload 5 Items',     'Upload 5 pieces of media this week',                20, 'weekly',   'weekly_uploads', 5,  '🎯')
ON CONFLICT DO NOTHING;
