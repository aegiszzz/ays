/*
  # Fix group_members policies using security definer function
  
  1. Changes
    - Create a security definer function to check group membership
    - This bypasses RLS and prevents infinite recursion
    - Update policies to use this function
  
  2. Notes
    - Security definer functions run with the privileges of the function owner
    - This allows the policy to check group_members without triggering RLS recursion
*/

-- Create a function to check if user is in a group (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION is_user_in_group(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM group_members 
    WHERE user_id = p_user_id 
    AND group_id = p_group_id
  );
$$;

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view members of their groups" ON group_members;

-- Create new policy using the function
CREATE POLICY "Users can view members of their groups"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    is_user_in_group(auth.uid(), group_id)
  );
