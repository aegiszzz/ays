/*
  # Fix notifications and friends system

  1. Changes
    - Add 'follow' type to notifications table type constraint
    - This allows both 'friend_add' and 'follow' notification types to work
  
  2. Notes
    - We're keeping both types for flexibility
    - 'follow' = used when someone follows you from profile page
    - 'friend_add' = used when someone adds you as friend from search page
*/

-- Drop the existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the new constraint with 'follow' type included
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('friend_add', 'follow', 'like', 'comment', 'message', 'group_invite'));