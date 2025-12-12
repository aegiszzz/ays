/*
  # Add status column to friends table

  1. Changes
    - Add `status` column to `friends` table with values: 'pending', 'accepted', 'rejected'
    - Set default status to 'accepted' for backward compatibility
    - Update all existing friend relationships to 'accepted' status
  
  2. Notes
    - Existing friendships are auto-accepted for simplicity
    - Future friend requests can use 'pending' status
*/

-- Add status column with default value
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'friends' AND column_name = 'status'
  ) THEN
    ALTER TABLE friends 
    ADD COLUMN status text DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'rejected'));
  END IF;
END $$;

-- Update all existing records to accepted status
UPDATE friends 
SET status = 'accepted' 
WHERE status IS NULL;

-- Make status NOT NULL after updating
ALTER TABLE friends 
ALTER COLUMN status SET NOT NULL;