/*
  # Add text media type support

  1. Changes
    - Drop existing media_type check constraint
    - Add new constraint that includes 'text', 'image', and 'video'
  
  2. Notes
    - Allows text-only messages without media attachments
    - Maintains support for image and video messages
*/

ALTER TABLE direct_messages 
DROP CONSTRAINT IF EXISTS direct_messages_media_type_check;

ALTER TABLE direct_messages 
ADD CONSTRAINT direct_messages_media_type_check 
CHECK (media_type IN ('text', 'image', 'video'));