/*
  # Create media shares table

  1. New Tables
    - `media_shares`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `ipfs_cid` (text, IPFS content identifier)
      - `media_type` (text, 'image' or 'video')
      - `caption` (text, optional description)
      - `is_public` (boolean, if true visible to all, if false only to specific users)
      - `created_at` (timestamptz)
      
    - `media_access`
      - `id` (uuid, primary key)
      - `media_id` (uuid, foreign key to media_shares)
      - `user_id` (uuid, foreign key to auth.users)
      - `created_at` (timestamptz)
      
  2. Security
    - Enable RLS on both tables
    - Users can view their own uploads
    - Users can view public media
    - Users can view private media if they have access
    - Users can only create access records for their own media
*/

CREATE TABLE IF NOT EXISTS media_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ipfs_cid text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  caption text,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid REFERENCES media_shares(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(media_id, user_id)
);

ALTER TABLE media_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own media"
  ON media_shares FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public media"
  ON media_shares FOR SELECT
  TO authenticated
  USING (is_public = true);

CREATE POLICY "Users can view media shared with them"
  ON media_shares FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM media_access
      WHERE media_access.media_id = media_shares.id
      AND media_access.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own media"
  ON media_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own media"
  ON media_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view access records for their media"
  ON media_access FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM media_shares
      WHERE media_shares.id = media_access.media_id
      AND media_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create access records for their media"
  ON media_access FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM media_shares
      WHERE media_shares.id = media_access.media_id
      AND media_shares.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete access records for their media"
  ON media_access FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM media_shares
      WHERE media_shares.id = media_access.media_id
      AND media_shares.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_media_shares_user_id ON media_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_media_shares_created_at ON media_shares(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_access_media_id ON media_access(media_id);
CREATE INDEX IF NOT EXISTS idx_media_access_user_id ON media_access(user_id);