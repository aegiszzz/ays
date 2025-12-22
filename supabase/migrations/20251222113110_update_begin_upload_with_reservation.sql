/*
  # Update Begin Upload with Credit Reservation

  Updates the upload flow to reserve credits during begin-upload.

  ## Changes
  1. Check available credits (balance - reserved) not just balance
  2. Reserve credits atomically with row lock
  3. Create upload record with reserved flag

  ## Safety
  - Row-level lock prevents race conditions
  - Transaction ensures atomicity
  - Rollback on any error
*/

-- Note: Begin-upload logic is in edge function, but we create a helper function
-- for atomic reservation that edge function can call

CREATE OR REPLACE FUNCTION reserve_credits_for_upload(
  p_user_id uuid,
  p_credits_to_reserve bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance bigint;
  v_current_reserved bigint;
  v_available_credits bigint;
  v_result json;
BEGIN
  -- Lock the storage account row
  SELECT credits_balance, credits_reserved
  INTO v_current_balance, v_current_reserved
  FROM storage_account
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if account exists
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Storage account not found for user %', p_user_id;
  END IF;

  -- Calculate available credits
  v_available_credits := v_current_balance - v_current_reserved;

  -- Check if sufficient available credits
  IF v_available_credits < p_credits_to_reserve THEN
    RAISE EXCEPTION 'Insufficient available credits. Available: %, Required: %',
      v_available_credits, p_credits_to_reserve;
  END IF;

  -- Reserve credits
  UPDATE storage_account
  SET
    credits_reserved = credits_reserved + p_credits_to_reserve,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Return success
  SELECT json_build_object(
    'success', true,
    'credits_reserved', p_credits_to_reserve,
    'available_credits', v_available_credits - p_credits_to_reserve
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION reserve_credits_for_upload TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_credits_for_upload TO service_role;
