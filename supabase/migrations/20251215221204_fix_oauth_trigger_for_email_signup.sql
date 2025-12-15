/*
  # Fix OAuth Trigger to Skip Email/Password Signups
  
  1. Changes
    - Update handle_oauth_user function to only create users for OAuth signups
    - Email/password users will be created after email verification
    
  2. Security
    - No changes to RLS policies
*/

CREATE OR REPLACE FUNCTION handle_oauth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  default_username text;
  user_provider text;
BEGIN
  -- Get the provider from identities
  SELECT provider INTO user_provider
  FROM auth.identities
  WHERE user_id = NEW.id
  LIMIT 1;
  
  -- Only proceed for OAuth users (not email provider)
  -- Email users will be created after verification
  IF user_provider IS NULL OR user_provider = 'email' THEN
    RETURN NEW;
  END IF;

  -- Only proceed if user profile doesn't exist yet
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    -- Try to get username from user_metadata first
    IF NEW.raw_user_meta_data->>'username' IS NOT NULL THEN
      default_username := NEW.raw_user_meta_data->>'username';
    ELSIF NEW.raw_user_meta_data->>'user_name' IS NOT NULL THEN
      default_username := NEW.raw_user_meta_data->>'user_name';
    ELSIF NEW.raw_user_meta_data->>'name' IS NOT NULL THEN
      default_username := NEW.raw_user_meta_data->>'name';
    ELSIF NEW.email IS NOT NULL THEN
      default_username := split_part(NEW.email, '@', 1);
    ELSE
      default_username := 'user_' || substring(NEW.id::text, 1, 8);
    END IF;

    -- Ensure username is unique by appending random suffix if needed
    WHILE EXISTS (SELECT 1 FROM public.users WHERE username = default_username) LOOP
      default_username := default_username || floor(random() * 1000)::text;
    END LOOP;

    -- Insert user profile (trigger bypasses RLS with SECURITY DEFINER)
    INSERT INTO public.users (id, email, username, email_verified, created_at)
    VALUES (
      NEW.id,
      NEW.email,
      default_username,
      true,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;