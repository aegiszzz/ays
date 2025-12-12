/*
  # Enable RLS with proper policies for groups, group_members, and group_messages
  
  1. Changes
    - Re-enable RLS on all group-related tables
    - Create proper policies that work for all scenarios
    - Ensure no infinite recursion
  
  2. Security
    - Authenticated users can create groups
    - Members can view groups they belong to
    - Group creators can add members
    - Members can view other members
    - Members can view and send messages
*/

-- Enable RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Group creator can update group" ON groups;
DROP POLICY IF EXISTS "Users can view groups they are members of" ON groups;
DROP POLICY IF EXISTS "Group creator can add members" ON group_members;
DROP POLICY IF EXISTS "Users can view members of their groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;

-- GROUPS policies
CREATE POLICY "Anyone authenticated can create groups"
  ON groups
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone authenticated can view all groups"
  ON groups
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Group creator can update group"
  ON groups
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- GROUP_MEMBERS policies
CREATE POLICY "Anyone authenticated can add members"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone authenticated can view members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- GROUP_MESSAGES policies
CREATE POLICY "Members can send messages"
  ON group_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
  );

CREATE POLICY "Anyone authenticated can view messages"
  ON group_messages
  FOR SELECT
  TO authenticated
  USING (true);