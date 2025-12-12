/*
  # Fix friends table foreign keys
  
  1. Changes
    - Drop existing foreign keys if they reference auth.users
    - Add proper foreign keys to public.users table
    - This enables proper join queries with username data
  
  2. Notes
    - Foreign keys must reference public.users, not auth.users
    - This allows Supabase queries to properly join user data
*/

-- Drop existing foreign key constraints if they exist
DO $$
BEGIN
  -- Try to drop user_id foreign key
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'friends_user_id_fkey'
    AND table_name = 'friends'
  ) THEN
    ALTER TABLE friends DROP CONSTRAINT friends_user_id_fkey;
  END IF;

  -- Try to drop friend_id foreign key
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'friends_friend_id_fkey'
    AND table_name = 'friends'
  ) THEN
    ALTER TABLE friends DROP CONSTRAINT friends_friend_id_fkey;
  END IF;
END $$;

-- Add proper foreign keys to public.users
ALTER TABLE friends
  ADD CONSTRAINT friends_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE friends
  ADD CONSTRAINT friends_friend_id_fkey
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE;