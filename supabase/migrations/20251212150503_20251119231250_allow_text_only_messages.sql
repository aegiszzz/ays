/*
  # Allow text-only messages in direct messages

  1. Changes
    - Modify `ipfs_cid` column in `direct_messages` table to allow NULL values
    - This enables sending text-only messages without media attachments
  
  2. Notes
    - Media type 'text' will be used for messages without attachments
    - Existing data remains unchanged
*/

ALTER TABLE direct_messages 
ALTER COLUMN ipfs_cid DROP NOT NULL;