/*
  # Add profile customization fields to users table

  1. Changes
    - Add `bio` column for user bio/about text (max 200 characters)
    - Add `avatar_url` column for profile picture (IPFS CID or URL)
    - Add `cover_image_url` column for cover/header image (IPFS CID or URL)
    - Add `website` column for personal website link
    - Add `location` column for user location
  
  2. Notes
    - All fields are optional (nullable) for backward compatibility
    - Existing users will have NULL values for these fields
    - Bio is limited to 200 characters for better UX
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'bio'
  ) THEN
    ALTER TABLE users ADD COLUMN bio text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE users ADD COLUMN avatar_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cover_image_url'
  ) THEN
    ALTER TABLE users ADD COLUMN cover_image_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'website'
  ) THEN
    ALTER TABLE users ADD COLUMN website text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'location'
  ) THEN
    ALTER TABLE users ADD COLUMN location text;
  END IF;
END $$;

ALTER TABLE users 
  ADD CONSTRAINT bio_length_check 
  CHECK (length(bio) <= 200);
