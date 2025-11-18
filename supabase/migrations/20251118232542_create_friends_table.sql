/*
  # Create friends/follow system table

  1. New Tables
    - `friends`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users - the person adding)
      - `friend_id` (uuid, foreign key to auth.users - the person being added)
      - `created_at` (timestamptz)
      
  2. Security
    - Enable RLS on friends table
    - Users can view their own friend list
    - Users can add friends as themselves
    - Users can remove their own friend relationships
    - Users can see who added them as friends

  3. Constraints
    - Unique constraint on (user_id, friend_id) to prevent duplicates
    - Check constraint to prevent self-friending

  4. Indexes
    - Index on user_id for faster friend list queries
    - Index on friend_id for reverse lookups
*/

CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  friend_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT no_self_friend CHECK (user_id != friend_id),
  CONSTRAINT unique_friendship UNIQUE (user_id, friend_id)
);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their friend list"
  ON friends FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view who added them"
  ON friends FOR SELECT
  TO authenticated
  USING (auth.uid() = friend_id);

CREATE POLICY "Users can add friends"
  ON friends FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their friendships"
  ON friends FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
