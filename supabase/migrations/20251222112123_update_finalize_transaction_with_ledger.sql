/*
  # Update Finalize Upload Transaction with Ledger

  Updates the finalize_upload_transaction function to:
  
  1. **Use credits_required from uploads table** (not passed as parameter)
  2. **Write to storage_ledger** for audit trail
  3. **Set credits_charged** on upload completion
  4. **Validate ownership** (user_id must match)

  This ensures:
  - No recalculation errors (uses stored credits_required)
  - Complete audit trail in ledger
  - Stronger security (ownership validation)
*/

CREATE OR REPLACE FUNCTION finalize_upload_transaction(
  p_user_id uuid,
  p_upload_id uuid,
  p_credits_to_charge bigint, -- Still accepted for backward compatibility but not used
  p_ipfs_cid text DEFAULT NULL,
  p_media_share_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance bigint;
  v_new_balance bigint;
  v_account_record json;
  v_upload_record record;
  v_credits_required bigint;
BEGIN
  -- Get upload record and validate ownership
  SELECT * INTO v_upload_record
  FROM uploads
  WHERE id = p_upload_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload not found or access denied';
  END IF;

  -- Check if already completed (idempotent)
  IF v_upload_record.status = 'complete' THEN
    SELECT json_build_object(
      'success', true,
      'message', 'Already completed (idempotent)',
      'credits_charged', v_upload_record.credits_charged
    ) INTO v_account_record;
    RETURN v_account_record;
  END IF;

  -- Use credits_required from upload record (not parameter)
  v_credits_required := COALESCE(v_upload_record.credits_required, v_upload_record.credits_charged, p_credits_to_charge);

  -- Lock the storage account row for this user
  SELECT credits_balance INTO v_current_balance
  FROM storage_account
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Storage account not found for user %', p_user_id;
  END IF;

  -- Check if sufficient credits
  IF v_current_balance < v_credits_required THEN
    RAISE EXCEPTION 'Insufficient credits. Available: %, Required: %', 
      v_current_balance, v_credits_required;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - v_credits_required;

  -- Update storage account (deduct credits)
  UPDATE storage_account
  SET 
    credits_balance = v_new_balance,
    credits_spent = credits_spent + v_credits_required,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Mark upload as complete with credits_charged
  UPDATE uploads
  SET 
    status = 'complete',
    credits_charged = v_credits_required,
    ipfs_cid = p_ipfs_cid,
    media_share_id = p_media_share_id,
    completed_at = now()
  WHERE id = p_upload_id;

  -- Write to ledger for audit trail
  INSERT INTO storage_ledger (
    user_id,
    ledger_type,
    credits_amount,
    upload_id,
    metadata
  ) VALUES (
    p_user_id,
    'charge_upload',
    -v_credits_required, -- Negative for deduction
    p_upload_id,
    json_build_object(
      'file_size_bytes', v_upload_record.file_size_bytes,
      'ipfs_cid', p_ipfs_cid
    )
  );

  -- Return success with updated account info
  SELECT json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'credits_charged', v_credits_required
  ) INTO v_account_record;

  RETURN v_account_record;
END;
$$;
