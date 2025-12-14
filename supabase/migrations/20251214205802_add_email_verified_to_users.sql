/*
  # Add email verification flag to users table

  1. Changes
    - Add `email_verified` boolean column to `users` table
    - Set default value to false for new users
    - Update existing users who have verified codes to true
  
  2. Security
    - No RLS changes needed as this is an internal flag
*/

-- Add email_verified column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT false;
  END IF;
END $$;

-- Update existing users who have verified codes
UPDATE users
SET email_verified = true
WHERE id IN (
  SELECT DISTINCT user_id 
  FROM verification_codes 
  WHERE verified = true
);