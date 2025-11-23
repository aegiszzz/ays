/*
  # Fix groups INSERT policy
  
  1. Changes
    - Drop existing INSERT policy
    - Create simpler policy that allows authenticated users to create groups
    - The created_by field will automatically be their user ID
  
  2. Notes
    - Previous policy may have been too strict
    - New policy allows any authenticated user to insert if created_by matches their ID
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can create groups" ON groups;

-- Create new simplified INSERT policy
CREATE POLICY "Authenticated users can create groups"
  ON groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
  );
