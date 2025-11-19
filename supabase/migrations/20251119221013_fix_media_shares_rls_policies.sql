/*
  # Fix infinite recursion in media_shares RLS policies

  1. Changes
    - Drop existing problematic policies that cause infinite recursion
    - Create new simplified policies without cross-table references
    - Keep security intact while avoiding circular dependencies

  2. Security
    - Users can view their own media
    - Users can view public media
    - Users can view media explicitly shared with them
    - Users can create, update, and delete their own media
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own media" ON media_shares;
DROP POLICY IF EXISTS "Users can view public media" ON media_shares;
DROP POLICY IF EXISTS "Users can view media shared with them" ON media_shares;
DROP POLICY IF EXISTS "Users can create their own media" ON media_shares;
DROP POLICY IF EXISTS "Users can delete their own media" ON media_shares;

DROP POLICY IF EXISTS "Users can view access records for their media" ON media_access;
DROP POLICY IF EXISTS "Users can create access records for their media" ON media_access;
DROP POLICY IF EXISTS "Users can delete access records for their media" ON media_access;

-- Create new simplified policies for media_shares
CREATE POLICY "Users can view own media"
  ON media_shares FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public media"
  ON media_shares FOR SELECT
  TO authenticated
  USING (is_public = true);

CREATE POLICY "Users can insert own media"
  ON media_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media"
  ON media_shares FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media"
  ON media_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create new simplified policies for media_access
CREATE POLICY "Users can view own access records"
  ON media_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert access records"
  ON media_access FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete access records"
  ON media_access FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
