/*
  # Create group messages table

  1. New Tables
    - `group_messages`
      - `id` (uuid, primary key)
      - `group_id` (uuid, references groups)
      - `sender_id` (uuid, references users)
      - `message_text` (text, nullable for media-only messages)
      - `media_type` (text, nullable - 'image', 'video', or null)
      - `ipfs_cid` (text, nullable - IPFS hash for media)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS
    - Only group members can send messages
    - Only group members can view messages
    - Senders can delete their own messages
*/

CREATE TABLE IF NOT EXISTS group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  message_text text,
  media_type text,
  ipfs_cid text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT message_has_content CHECK (
    message_text IS NOT NULL OR ipfs_cid IS NOT NULL
  )
);

ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can send messages"
  ON group_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can view messages"
  ON group_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Senders can delete their messages"
  ON group_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender_id ON group_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON group_messages(created_at DESC);
