-- CRITICAL: Restrict SELECT on encrypted private key columns
-- Previously: RLS policy "Users can select all profiles" with USING(true) allowed any authenticated
-- user to read every other user's encrypted_private_key / encrypted_solana_private_key columns.
-- Combined with visible user.id (the PBKDF2 input), this enabled offline decryption of all wallets.
--
-- Fix: revoke column-level SELECT on those 2 columns, and expose a SECURITY DEFINER function
-- that returns only the caller's own encrypted key.

REVOKE SELECT (encrypted_private_key, encrypted_solana_private_key) ON users FROM authenticated;
REVOKE SELECT (encrypted_private_key, encrypted_solana_private_key) ON users FROM anon;

CREATE OR REPLACE FUNCTION get_my_private_key(p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_type = 'bsc' THEN
    SELECT encrypted_private_key INTO v_key FROM users WHERE id = v_uid;
  ELSIF p_type = 'solana' THEN
    SELECT encrypted_solana_private_key INTO v_key FROM users WHERE id = v_uid;
  ELSE
    RAISE EXCEPTION 'Invalid key type';
  END IF;

  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_my_private_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_private_key(text) TO authenticated;

COMMENT ON FUNCTION get_my_private_key IS 'Returns the caller''s own encrypted private key. Only accessible via auth.uid() match.';
