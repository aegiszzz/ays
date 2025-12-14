/*
  # Fix Group Members Infinite Recursion
  
  1. Problem
    - The RLS policy on group_members causes infinite recursion
    - Policy queries the same table it's protecting
  
  2. Solution
    - Create a security definer function to check membership
    - Replace recursive policy with function-based check
  
  3. Security
    - Function runs with elevated privileges but safely
    - Only checks membership, doesn't expose data
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Members can select membership" ON group_members;

-- Create a safe function to check group membership
CREATE OR REPLACE FUNCTION is_group_member(group_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = group_uuid 
    AND user_id = auth.uid()
  );
END;
$$;

-- Create new policy using the function
CREATE POLICY "Members can view group membership"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR is_group_member(group_id)
  );