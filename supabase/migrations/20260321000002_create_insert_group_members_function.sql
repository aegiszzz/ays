-- Create a SECURITY DEFINER function to insert group members
-- This bypasses the recursive SELECT policy on group_members,
-- fixing the "infinite recursion detected in policy for relation group_members" error.

CREATE OR REPLACE FUNCTION insert_group_members(p_group_id UUID, p_member_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the group creator is allowed to add members
  IF NOT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id
      AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to add members to this group';
  END IF;

  INSERT INTO group_members (group_id, user_id)
  SELECT p_group_id, unnest(p_member_ids)
  ON CONFLICT (group_id, user_id) DO NOTHING;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION insert_group_members(UUID, UUID[]) TO authenticated;
