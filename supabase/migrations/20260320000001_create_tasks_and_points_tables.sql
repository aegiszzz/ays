/*
  # Create Tasks & Points System Tables
*/

-- Add total_points column to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_points bigint DEFAULT 0;

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  points integer NOT NULL DEFAULT 1,
  task_type text NOT NULL CHECK (task_type IN ('daily', 'weekly', 'one_time')),
  action_type text NOT NULL,
  required_count integer NOT NULL DEFAULT 1,
  icon text DEFAULT 'star',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- User tasks (completion tracking)
CREATE TABLE IF NOT EXISTS user_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  current_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  points_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_tasks_user_id ON user_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_task_id ON user_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_completed_at ON user_tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_users_total_points ON users(total_points DESC);

-- RLS policies (using DO blocks to avoid duplicate errors)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can view active tasks" ON tasks FOR SELECT TO authenticated USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins have full access to tasks" ON tasks FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own task completions" ON user_tasks FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own task completions" ON user_tasks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own task completions" ON user_tasks FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Anyone can view profiles" ON users;
DO $$ BEGIN
  CREATE POLICY "Anyone can view profiles" ON users FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Atomic points increment function
CREATE OR REPLACE FUNCTION increment_user_points(p_user_id uuid, p_points integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_new_total bigint;
BEGIN
  UPDATE users SET total_points = COALESCE(total_points, 0) + p_points, updated_at = now()
  WHERE id = p_user_id RETURNING total_points INTO v_new_total;
  RETURN v_new_total;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_user_points TO authenticated;

-- Seed default tasks
INSERT INTO tasks (title, description, points, task_type, action_type, required_count, icon) VALUES
  ('Daily Check-In', 'Check in daily to earn points', 1, 'daily', 'daily_checkin', 1, 'calendar'),
  ('Upload Media', 'Upload a photo or video', 5, 'daily', 'upload_media', 1, 'upload'),
  ('Share Content', 'Share a post publicly', 3, 'daily', 'share_content', 1, 'share'),
  ('First Upload', 'Upload your first media', 10, 'one_time', 'first_upload', 1, 'award'),
  ('Social Butterfly', 'Share 10 posts in a week', 25, 'weekly', 'weekly_shares', 10, 'users'),
  ('Storage Explorer', 'Upload 5 files in a week', 20, 'weekly', 'weekly_uploads', 5, 'hard-drive')
ON CONFLICT DO NOTHING;
