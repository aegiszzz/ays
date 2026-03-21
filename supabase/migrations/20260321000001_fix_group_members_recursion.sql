-- Fix infinite recursion in group_members RLS policy
-- The policy in 20251222141744 queries group_members from within group_members policy,
-- causing infinite recursion. Use SECURITY DEFINER function to break the cycle.

-- Ensure the security definer function exists (bypass RLS)
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

-- Replace the recursive SELECT policy
DROP POLICY IF EXISTS "Members can view group membership" ON public.group_members;
CREATE POLICY "Members can view group membership"
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR is_group_member(group_id)
  );
