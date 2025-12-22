/*
  # Update Add Storage Credits with Ledger

  Updates the add_storage_credits function to:
  
  1. **Write to storage_ledger** for audit trail
  2. **Support different ledger types** (grant_free, purchase_add_storage, admin_adjust)
  3. **Accept optional reference and metadata** for payment tracking

  This ensures complete audit trail for all credit additions.
*/

CREATE OR REPLACE FUNCTION add_storage_credits(
  p_user_id uuid,
  p_credits_to_add bigint,
  p_ledger_type text DEFAULT 'purchase_add_storage',
  p_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_record json;
  v_new_balance bigint;
  v_new_total bigint;
BEGIN
  -- Validate positive credits
  IF p_credits_to_add <= 0 THEN
    RAISE EXCEPTION 'Credits to add must be positive';
  END IF;

  -- Validate ledger type
  IF p_ledger_type NOT IN ('grant_free', 'purchase_add_storage', 'admin_adjust') THEN
    RAISE EXCEPTION 'Invalid ledger type: %', p_ledger_type;
  END IF;

  -- Update storage account
  UPDATE storage_account
  SET 
    credits_balance = credits_balance + p_credits_to_add,
    credits_total = credits_total + p_credits_to_add,
    updated_at = now()
  WHERE user_id = p_user_id
  RETURNING credits_balance, credits_total INTO v_new_balance, v_new_total;

  -- Check if update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage account not found for user %', p_user_id;
  END IF;

  -- Write to ledger for audit trail
  INSERT INTO storage_ledger (
    user_id,
    ledger_type,
    credits_amount,
    reference,
    metadata
  ) VALUES (
    p_user_id,
    p_ledger_type,
    p_credits_to_add, -- Positive for addition
    p_reference,
    p_metadata
  );

  -- Return success with updated balances
  SELECT json_build_object(
    'success', true,
    'credits_added', p_credits_to_add,
    'new_balance', v_new_balance,
    'new_total', v_new_total
  ) INTO v_account_record;

  RETURN v_account_record;
END;
$$;
