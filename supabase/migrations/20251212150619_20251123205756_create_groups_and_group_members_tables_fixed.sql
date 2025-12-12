/*
  # Create groups and group members tables

  1. New Tables
    - `groups`
      - `id` (uuid, primary key)
      - `name` (text, group name)
      - `created_by` (uuid, references users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `group_members`
      - `id` (uuid, primary key)
      - `group_id` (uuid, references groups)
      - `user_id` (uuid, references users)
      - `joined_at` (timestamptz)
      - Unique constraint on (group_id, user_id)
  
  2. Security
    - Enable RLS on both tables
    - Users can create groups
    - Users can view groups they are members of
    - Only group creator can add members
    - Group members can view other members
    - Users can leave groups (delete their membership)
*/

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create groups"
  ON groups
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view groups they are members of"
  ON groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group creator can update group"
  ON groups
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group creator can add members"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND groups.created_by = auth.uid()
    )
  );

CREATE POLICY "Group members can view other members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);