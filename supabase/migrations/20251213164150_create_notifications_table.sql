/*
  # Create notifications table

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users) - User receiving the notification
      - `type` (text) - Type of notification: 'friend_add', 'like', 'comment', 'message', 'group_invite'
      - `related_user_id` (uuid, foreign key to auth.users) - User who triggered the notification
      - `related_item_id` (uuid) - ID of related item (post_id, comment_id, message_id, group_id)
      - `content` (text, optional) - Additional content (e.g., comment text preview)
      - `read` (boolean) - Whether notification has been read
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on notifications table
    - Users can only view their own notifications
    - Users can only update their own notifications (mark as read)
    - System can insert notifications for any user (handled by triggers or app logic)

  3. Indexes
    - Index on user_id for faster queries
    - Index on created_at for sorting
    - Index on read status for filtering unread notifications
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('friend_add', 'like', 'comment', 'message', 'group_invite')),
  related_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  related_item_id uuid,
  content text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);