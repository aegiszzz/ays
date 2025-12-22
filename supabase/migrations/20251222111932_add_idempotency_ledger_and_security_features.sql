/*
  # Storage System Security and Audit Improvements

  This migration adds critical security and audit features to the storage system:

  1. **Idempotency Protection**
     - Adds `idempotency_key` to uploads table
     - Prevents duplicate charges from network retries/double-taps
     - Unique constraint on (user_id, idempotency_key)

  2. **Audit Trail (Storage Ledger)**
     - New `storage_ledger` table for complete transaction history
     - Tracks all credit changes: grants, charges, purchases, adjustments
     - Essential for debugging and fraud detection

  3. **Enhanced Upload Tracking**
     - Adds `credits_required` field (calculated at begin-upload)
     - Adds `deleted_at` for soft delete (no refund on deletion)
     - Better audit and prevents recalculation issues

  4. **Security**
     - RLS policies for ledger (users see only their own records)
     - Ledger is insert-only (no updates/deletes)
*/

-- Add idempotency and audit fields to uploads table
DO $$
BEGIN
  -- Add idempotency_key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE uploads ADD COLUMN idempotency_key text;
  END IF;

  -- Add credits_required
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'credits_required'
  ) THEN
    ALTER TABLE uploads ADD COLUMN credits_required bigint;
  END IF;

  -- Add deleted_at for soft delete
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uploads' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE uploads ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- Create unique index for idempotency (excluding nulls)
CREATE UNIQUE INDEX IF NOT EXISTS uploads_user_idempotency_key_unique
  ON uploads(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Create storage_ledger table for audit trail
CREATE TABLE IF NOT EXISTS storage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ledger_type text NOT NULL CHECK (ledger_type IN ('grant_free', 'charge_upload', 'purchase_add_storage', 'admin_adjust', 'refund_upload')),
  credits_amount bigint NOT NULL,
  upload_id uuid REFERENCES uploads(id) ON DELETE SET NULL,
  reference text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create index for efficient ledger queries
CREATE INDEX IF NOT EXISTS storage_ledger_user_id_created_at_idx 
  ON storage_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS storage_ledger_upload_id_idx 
  ON storage_ledger(upload_id) 
  WHERE upload_id IS NOT NULL;

-- Enable RLS on storage_ledger
ALTER TABLE storage_ledger ENABLE ROW LEVEL SECURITY;

-- Ledger policies: Users can only view their own records
CREATE POLICY "Users can view own ledger entries"
  ON storage_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Ledger is append-only from edge functions (no direct insert from users)
-- Edge functions use service role

-- Add comment for documentation
COMMENT ON TABLE storage_ledger IS 'Immutable audit log of all storage credit transactions';
COMMENT ON COLUMN storage_ledger.ledger_type IS 'Type of transaction: grant_free, charge_upload, purchase_add_storage, admin_adjust, refund_upload';
COMMENT ON COLUMN storage_ledger.credits_amount IS 'Credit change amount (positive for additions, negative for charges)';
COMMENT ON COLUMN storage_ledger.reference IS 'External reference (e.g., payment transaction ID, admin ticket)';
COMMENT ON COLUMN storage_ledger.metadata IS 'Additional context (e.g., file_size, file_type, admin_notes)';
