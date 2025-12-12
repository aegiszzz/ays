/*
  # Add Wallet Address to Users Table

  1. Changes
    - Add `wallet_address` column to `users` table
      - Stores the user's EVM-compatible wallet address
      - Unique constraint to prevent duplicate wallets
      - Not null after migration completes

  2. Security
    - Only the wallet's public address is stored (never private keys)
    - Private keys are stored locally on user's device using expo-secure-store
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'wallet_address'
  ) THEN
    ALTER TABLE users ADD COLUMN wallet_address text;
  END IF;
END $$;

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_wallet_address_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);
  END IF;
END $$;