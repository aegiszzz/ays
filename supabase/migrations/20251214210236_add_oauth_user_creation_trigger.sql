/*
  # Add trigger for OAuth user creation

  1. Changes
    - Create trigger function for OAuth users only
    - Function checks if user profile already exists
    - If not exists, creates profile with username from metadata or email
  
  2. Security
    - Trigger uses SECURITY DEFINER to bypass RLS
    - Only creates profile if it doesn't exist (ON CONFLICT DO NOTHING)
*/

-- Create trigger function for OAuth users
CREATE OR REPLACE FUNCTION public.handle_oauth_user()
RETURNS trigger 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  default_username text;
BEGIN
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

-- Add trigger to auth.users for OAuth users
DROP TRIGGER IF EXISTS on_oauth_user_created ON auth.users;

CREATE TRIGGER on_oauth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_oauth_user();