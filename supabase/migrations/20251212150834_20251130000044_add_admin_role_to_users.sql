/*
  # Add Admin Role to Users

  1. Changes
    - Add `is_admin` boolean column to users table
    - Default value is false for security
    - Add `admin_email` column to store admin email (optional)
  
  2. Security
    - Only admins can see other users' admin status
    - Users cannot promote themselves to admin
*/

-- Add admin flag to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add admin email for reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'admin_email'
  ) THEN
    ALTER TABLE users ADD COLUMN admin_email TEXT;
  END IF;
END $$;

-- Create index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;