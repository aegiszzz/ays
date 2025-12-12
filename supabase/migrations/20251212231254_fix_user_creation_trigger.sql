/*
  # Fix user creation trigger for custom username support

  1. Changes
    - Update handle_new_user function to read username from user_metadata
    - Keep auto-generation fallback if no username provided
    - Ensure wallet_address placeholder for later update
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  default_username text;
  wallet_addr text;
BEGIN
  -- Try to get username from user_metadata first
  IF NEW.raw_user_meta_data->>'username' IS NOT NULL THEN
    default_username := NEW.raw_user_meta_data->>'username';
  ELSIF NEW.email IS NOT NULL THEN
    default_username := split_part(NEW.email, '@', 1);
  ELSIF NEW.raw_user_meta_data->>'user_name' IS NOT NULL THEN
    default_username := NEW.raw_user_meta_data->>'user_name';
  ELSIF NEW.raw_user_meta_data->>'name' IS NOT NULL THEN
    default_username := NEW.raw_user_meta_data->>'name';
  ELSE
    default_username := 'user_' || substring(NEW.id::text, 1, 8);
  END IF;

  -- Ensure username is unique by appending random suffix if needed
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = default_username) LOOP
    default_username := default_username || floor(random() * 1000)::text;
  END LOOP;

  -- Placeholder wallet (will be updated by client)
  wallet_addr := NULL;

  -- Insert user profile only if it doesn't exist
  INSERT INTO public.users (id, email, username, wallet_address, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    default_username,
    wallet_addr,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
