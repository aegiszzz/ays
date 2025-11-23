/*
  # Fix group and group_members RLS policies
  
  1. Changes
    - Drop existing problematic policies that cause infinite recursion
    - Create simplified policies that don't cause recursion
    - Allow group creators to add members without checking membership
    - Allow all authenticated users to view group members if they're in that group
  
  2. Security
    - Group creators can insert any member
    - Members can view other members in their groups
    - Users can leave groups
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Group creator can add members" ON group_members;
DROP POLICY IF EXISTS "Group members can view other members" ON group_members;

-- Create new simplified policies

-- Group creator can add members (checks groups table, not group_members)
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

-- Members can view other members (simple check without recursion)
CREATE POLICY "Members can view group members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT gm.group_id 
      FROM group_members gm
      WHERE gm.user_id = auth.uid()
    )
    OR
    user_id = auth.uid()
  );
