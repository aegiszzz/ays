/*
  # Add name field to users table

  1. Changes
    - Add `name` column to `users` table
      - `name` (text, nullable) - User's display name that can be changed
      - username remains unique and permanent

  2. Notes
    - Username is permanent and cannot be changed once set
    - Name is the display name that users can freely update
    - Existing users will have null names initially
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'name'
  ) THEN
    ALTER TABLE users ADD COLUMN name text;
  END IF;
END $$;