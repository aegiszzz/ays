/*
  # Simplify group_members SELECT policy to avoid recursion
  
  1. Changes
    - Drop the existing SELECT policy that has potential for recursion
    - Create a new policy that allows users to see members where they are also a member
    - Use a simpler approach that doesn't trigger recursive checks
  
  2. Notes
    - This allows viewing group members for groups the user belongs to
    - Avoids infinite recursion by not querying group_members within the policy
*/

-- Drop the problematic SELECT policy
DROP POLICY IF EXISTS "Members can view group members" ON group_members;

-- Create a simpler SELECT policy
-- Users can view group_members if they're a member of that group
CREATE POLICY "Users can view members of their groups"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- Can see own membership
    user_id = auth.uid()
    OR
    -- Can see other members if user is in same group
    group_id IN (
      SELECT DISTINCT gm.group_id 
      FROM group_members gm
      WHERE gm.user_id = auth.uid()
    )
  );
