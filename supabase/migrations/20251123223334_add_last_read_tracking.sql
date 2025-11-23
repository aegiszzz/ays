/*
  # Add last read message tracking
  
  1. New Columns
    - Add last_read_at to direct_messages conversations
    - Add last_read_message_id for group conversations
  
  2. New Tables
    - `conversation_reads` - Track last read timestamp for each user per conversation
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `conversation_type` (text: 'direct' or 'group')
      - `conversation_id` (text: user_id for direct, group_id for group)
      - `last_read_at` (timestamptz)
      - Unique constraint on (user_id, conversation_type, conversation_id)
  
  3. Security
    - Enable RLS
    - Users can only read/update their own read status
*/

CREATE TABLE IF NOT EXISTS conversation_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  conversation_type text NOT NULL CHECK (conversation_type IN ('direct', 'group')),
  conversation_id text NOT NULL,
  last_read_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, conversation_type, conversation_id)
);

ALTER TABLE conversation_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own read status"
  ON conversation_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own read status"
  ON conversation_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own read status"
  ON conversation_reads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_conversation_reads_user ON conversation_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reads_lookup ON conversation_reads(user_id, conversation_type, conversation_id);
