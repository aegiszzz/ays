/*
  # Atomic Upload Finalization Transaction

  Creates a PostgreSQL function to handle atomic credit deduction with row-level locking.
  This ensures:
  - No race conditions during concurrent uploads
  - No negative balances
  - Atomic updates to both uploads and storage_account tables
  - Proper transaction rollback on errors

  ## Function: finalize_upload_transaction
  Parameters:
  - p_user_id: The user's ID
  - p_upload_id: The upload record ID
  - p_credits_to_charge: Credits to deduct
  - p_ipfs_cid: Optional IPFS CID
  - p_media_share_id: Optional media share ID

  Returns: Updated storage account record

  ## Safety Features
  - SELECT FOR UPDATE locks the account row
  - CHECK constraint prevents negative balance
  - Transaction atomicity ensures consistency
  - Returns error if insufficient credits
*/

CREATE OR REPLACE FUNCTION finalize_upload_transaction(
  p_user_id uuid,
  p_upload_id uuid,
  p_credits_to_charge bigint,
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
BEGIN
  -- Lock the storage account row for this user (prevents concurrent modifications)
  SELECT credits_balance INTO v_current_balance
  FROM storage_account
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if account exists
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Storage account not found for user %', p_user_id;
  END IF;

  -- Check if sufficient credits
  IF v_current_balance < p_credits_to_charge THEN
    RAISE EXCEPTION 'Insufficient credits. Available: %, Required: %', 
      v_current_balance, p_credits_to_charge;
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - p_credits_to_charge;

  -- Update storage account (deduct credits)
  UPDATE storage_account
  SET 
    credits_balance = v_new_balance,
    credits_spent = credits_spent + p_credits_to_charge,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Mark upload as complete
  UPDATE uploads
  SET 
    status = 'complete',
    ipfs_cid = p_ipfs_cid,
    media_share_id = p_media_share_id,
    completed_at = now()
  WHERE id = p_upload_id;

  -- Return success with updated account info
  SELECT json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'credits_charged', p_credits_to_charge
  ) INTO v_account_record;

  RETURN v_account_record;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION finalize_upload_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_upload_transaction TO service_role;
