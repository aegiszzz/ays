/*
  # Add Storage Credits Function

  Creates a PostgreSQL function to safely add storage credits to a user's account.
  This is used when users purchase additional storage.

  ## Function: add_storage_credits
  Parameters:
  - p_user_id: The user's ID
  - p_credits_to_add: Credits to add (converted from GB purchase)

  Returns: Updated storage account record

  ## Safety Features
  - Atomic update
  - Validates positive credits only
  - Updates both balance and total
*/

CREATE OR REPLACE FUNCTION add_storage_credits(
  p_user_id uuid,
  p_credits_to_add bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_record json;
BEGIN
  -- Validate positive credits
  IF p_credits_to_add <= 0 THEN
    RAISE EXCEPTION 'Credits to add must be positive';
  END IF;

  -- Update storage account
  UPDATE storage_account
  SET 
    credits_balance = credits_balance + p_credits_to_add,
    credits_total = credits_total + p_credits_to_add,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Check if update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage account not found for user %', p_user_id;
  END IF;

  -- Return success
  SELECT json_build_object(
    'success', true,
    'credits_added', p_credits_to_add
  ) INTO v_account_record;

  RETURN v_account_record;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION add_storage_credits TO authenticated;
GRANT EXECUTE ON FUNCTION add_storage_credits TO service_role;
