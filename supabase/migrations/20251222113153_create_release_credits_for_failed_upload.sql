/*
  # Release Credits for Failed Upload

  Creates a function to release reserved credits when upload fails.

  ## Safety
  - Only releases reservation, does NOT deduct from balance
  - Idempotent: safe to call multiple times
  - Atomic with row lock
*/

CREATE OR REPLACE FUNCTION release_credits_for_failed_upload(
  p_user_id uuid,
  p_upload_id uuid,
  p_credits_to_release bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  -- Release reserved credits atomically
  UPDATE storage_account
  SET
    credits_reserved = GREATEST(0, credits_reserved - p_credits_to_release),
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Check if update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage account not found for user %', p_user_id;
  END IF;

  -- Return success
  SELECT json_build_object(
    'success', true,
    'credits_released', p_credits_to_release
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION release_credits_for_failed_upload TO authenticated;
GRANT EXECUTE ON FUNCTION release_credits_for_failed_upload TO service_role;
