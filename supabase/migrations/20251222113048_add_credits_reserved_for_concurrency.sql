/*
  # Add Credits Reserved for Concurrent Upload Protection

  Adds `credits_reserved` field to prevent UX issues with concurrent uploads.

  ## Problem
  Without reservation:
  1. User starts Upload A (100 credits, balance 150)
  2. User starts Upload B (100 credits, balance 150)
  3. Both begin() succeed
  4. Upload A finalizes → balance = 50
  5. Upload B finalizes → FAILS with "insufficient credits"
  6. Bad UX: Upload B failed AFTER uploading to IPFS

  ## Solution
  With reservation:
  1. User starts Upload A → reserve 100 (available = 50)
  2. User starts Upload B → FAILS immediately (available 50 < 100)
  3. Good UX: Upload B fails BEFORE uploading to IPFS

  ## Changes
  1. Add `credits_reserved` to storage_account
  2. Update begin-upload to reserve credits
  3. Update finalize-upload to release reservation
  4. Update fail-upload to release reservation
  5. Add CHECK constraint: credits_reserved >= 0
  6. Add CHECK constraint: credits_balance >= credits_reserved

  ## Migration Safety
  - New field defaults to 0 (no existing reservations)
  - All existing pending uploads will work (they have no reservation)
  - Future uploads will use reservation system
*/

-- Add credits_reserved field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'storage_account' AND column_name = 'credits_reserved'
  ) THEN
    ALTER TABLE storage_account ADD COLUMN credits_reserved bigint NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add CHECK constraints for safety
DO $$
BEGIN
  -- Ensure reserved credits are never negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'storage_account_credits_reserved_check'
  ) THEN
    ALTER TABLE storage_account
      ADD CONSTRAINT storage_account_credits_reserved_check
      CHECK (credits_reserved >= 0);
  END IF;

  -- Ensure balance >= reserved (can't reserve more than you have)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'storage_account_balance_reserved_check'
  ) THEN
    ALTER TABLE storage_account
      ADD CONSTRAINT storage_account_balance_reserved_check
      CHECK (credits_balance >= credits_reserved);
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN storage_account.credits_reserved IS 'Credits currently reserved for pending uploads. Prevents concurrent upload UX issues.';

-- Create helper view for available credits
CREATE OR REPLACE VIEW storage_account_available AS
SELECT
  user_id,
  credits_balance,
  credits_reserved,
  (credits_balance - credits_reserved) AS credits_available,
  credits_total,
  credits_spent,
  created_at,
  updated_at
FROM storage_account;

COMMENT ON VIEW storage_account_available IS 'Shows available credits (balance - reserved) for upload quota checks';
