/*
  # Purchase Idempotency System

  Ensures payment events are processed exactly once, preventing duplicate credits.

  ## Problem
  Payment webhooks (Stripe/Solana) can be received multiple times:
  - Network retries
  - Webhook replay
  - Manual replay for debugging

  Without idempotency, user could receive credits multiple times for same payment.

  ## Solution
  Store payment reference (tx_hash/payment_intent_id) with unique constraint.

  ## Tables
  1. purchases: Track all purchase transactions
  2. Unique constraint on (provider, payment_reference)

  ## Flow
  1. Webhook receives payment event
  2. Check if payment_reference already processed
  3. If yes: Return success (idempotent)
  4. If no: Process payment and add credits

  ## Safety
  - Atomic transaction
  - Unique constraint prevents race conditions
  - Audit trail for all purchases
*/

-- Create purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'solana', 'manual')),
  payment_reference text NOT NULL,
  amount_cents bigint,
  amount_sol decimal(20, 9),
  credits_added bigint NOT NULL,
  status text DEFAULT 'complete' NOT NULL CHECK (status IN ('pending', 'complete', 'failed', 'refunded')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(provider, payment_reference)
);

-- Index for user purchases
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at DESC);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Users can view own purchases
CREATE POLICY "Users can view own purchases"
  ON purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage purchases (webhooks)
CREATE POLICY "Service role can manage purchases"
  ON purchases FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE purchases IS 'Track all purchase transactions with idempotency protection';
COMMENT ON COLUMN purchases.payment_reference IS 'Unique payment identifier (tx_hash, payment_intent_id, etc)';
COMMENT ON COLUMN purchases.provider IS 'Payment provider: stripe, solana, manual';
COMMENT ON COLUMN purchases.credits_added IS 'Storage credits added to account';

-- Drop old functions
DROP FUNCTION IF EXISTS add_storage_credits(uuid, bigint);
DROP FUNCTION IF EXISTS add_storage_credits(uuid, bigint, text, text, jsonb);

-- Create new idempotent add_storage_credits function
CREATE OR REPLACE FUNCTION add_storage_credits(
  p_user_id uuid,
  p_credits_to_add bigint,
  p_provider text DEFAULT 'manual',
  p_payment_reference text DEFAULT NULL,
  p_amount_cents bigint DEFAULT NULL,
  p_amount_sol decimal DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance bigint;
  v_new_total bigint;
  v_account_record json;
  v_existing_purchase record;
  v_purchase_id uuid;
BEGIN
  -- Check for existing purchase (idempotency)
  IF p_payment_reference IS NOT NULL THEN
    SELECT * INTO v_existing_purchase
    FROM purchases
    WHERE provider = p_provider
      AND payment_reference = p_payment_reference;

    IF FOUND THEN
      -- Return existing purchase (idempotent)
      SELECT json_build_object(
        'success', true,
        'message', 'Purchase already processed (idempotent)',
        'idempotent', true,
        'purchase_id', v_existing_purchase.id,
        'credits_added', v_existing_purchase.credits_added
      ) INTO v_account_record;
      RETURN v_account_record;
    END IF;
  END IF;

  -- Lock the storage account row
  SELECT credits_balance, credits_total
  INTO v_new_balance, v_new_total
  FROM storage_account
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Create account if doesn't exist
  IF v_new_balance IS NULL THEN
    INSERT INTO storage_account (user_id, credits_balance, credits_total, credits_spent, credits_reserved)
    VALUES (p_user_id, p_credits_to_add, p_credits_to_add, 0, 0)
    RETURNING credits_balance, credits_total INTO v_new_balance, v_new_total;
  ELSE
    -- Add credits to existing account
    v_new_balance := v_new_balance + p_credits_to_add;
    v_new_total := v_new_total + p_credits_to_add;

    UPDATE storage_account
    SET
      credits_balance = v_new_balance,
      credits_total = v_new_total,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Record purchase
  INSERT INTO purchases (
    user_id,
    provider,
    payment_reference,
    amount_cents,
    amount_sol,
    credits_added,
    status,
    metadata
  ) VALUES (
    p_user_id,
    p_provider,
    COALESCE(p_payment_reference, gen_random_uuid()::text),
    p_amount_cents,
    p_amount_sol,
    p_credits_to_add,
    'complete',
    p_metadata
  ) RETURNING id INTO v_purchase_id;

  -- Write to ledger
  INSERT INTO storage_ledger (
    user_id,
    ledger_type,
    credits_amount,
    metadata
  ) VALUES (
    p_user_id,
    'purchase',
    p_credits_to_add,
    jsonb_build_object(
      'provider', p_provider,
      'payment_reference', p_payment_reference,
      'purchase_id', v_purchase_id
    )
  );

  -- Return success
  SELECT json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'credits_added', p_credits_to_add,
    'purchase_id', v_purchase_id
  ) INTO v_account_record;

  RETURN v_account_record;
END;
$$;

GRANT EXECUTE ON FUNCTION add_storage_credits TO authenticated;
GRANT EXECUTE ON FUNCTION add_storage_credits TO service_role;
