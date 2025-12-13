/*
  # Add encrypted_private_key to users table

  1. Changes
    - Add `encrypted_private_key` column to `users` table
      - `encrypted_private_key` (text, nullable) - Encrypted private key for user's crypto wallet

  2. Notes
    - This field stores the encrypted private key for the user's wallet
    - Only the user should be able to access this field
    - Used for wallet recovery and transaction signing
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'encrypted_private_key'
  ) THEN
    ALTER TABLE users ADD COLUMN encrypted_private_key text;
  END IF;
END $$;