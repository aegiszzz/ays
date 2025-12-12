/*
  # Create direct messages table

  1. New Tables
    - `direct_messages`
      - `id` (uuid, primary key)
      - `sender_id` (uuid, foreign key to auth.users)
      - `receiver_id` (uuid, foreign key to auth.users)
      - `ipfs_cid` (text, IPFS content identifier or media URI)
      - `media_type` (text, 'image' or 'video')
      - `caption` (text, optional message)
      - `read` (boolean, if message has been read)
      - `created_at` (timestamptz)
      
  2. Security
    - Enable RLS on direct_messages table
    - Users can view messages they sent
    - Users can view messages sent to them
    - Users can only send messages as themselves
    - Users can mark their received messages as read

  3. Indexes
    - Index on sender_id for faster queries
    - Index on receiver_id for faster queries
    - Index on created_at for sorting
*/

CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ipfs_cid text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  caption text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages they sent"
  ON direct_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id);

CREATE POLICY "Users can view messages sent to them"
  ON direct_messages FOR SELECT
  TO authenticated
  USING (auth.uid() = receiver_id);

CREATE POLICY "Users can send messages as themselves"
  ON direct_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their received messages"
  ON direct_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver_id ON direct_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created_at ON direct_messages(created_at DESC);