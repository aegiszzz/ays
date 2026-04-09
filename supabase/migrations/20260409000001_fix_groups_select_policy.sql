-- Fix groups SELECT policy to avoid circular RLS dependency
-- The old policy queried group_members directly, causing infinite recursion
-- Use is_group_member() SECURITY DEFINER function instead

DROP POLICY IF EXISTS "Members can select groups" ON groups;
CREATE POLICY "Members can select groups"
  ON groups FOR SELECT
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR is_group_member(id)
  );
