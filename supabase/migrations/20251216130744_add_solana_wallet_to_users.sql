/*
  # Add Solana Wallet Support

  1. Changes
    - Add `solana_wallet_address` column to users table
    - Add `encrypted_solana_private_key` column to users table
  
  2. Security
    - No changes to RLS policies (existing policies cover these columns)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'solana_wallet_address'
  ) THEN
    ALTER TABLE users ADD COLUMN solana_wallet_address text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'encrypted_solana_private_key'
  ) THEN
    ALTER TABLE users ADD COLUMN encrypted_solana_private_key text;
  END IF;
END $$;
