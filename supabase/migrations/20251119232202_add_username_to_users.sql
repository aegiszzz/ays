/*
  # Add username field to users table

  1. Changes
    - Add `username` column to `users` table
    - Username is unique and required
    - Generate default usernames from email for existing users
  
  2. Security
    - Update RLS policies to allow reading usernames
    - Users can update their own username
*/

-- Add username column (initially nullable)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username text;

-- Generate usernames from emails for existing users
UPDATE users 
SET username = LOWER(SPLIT_PART(email, '@', 1)) 
WHERE username IS NULL;

-- Make username required and unique
ALTER TABLE users 
ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users(username);

-- Update RLS policy to allow users to update their username
DROP POLICY IF EXISTS "Users can update own profile" ON users;

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
