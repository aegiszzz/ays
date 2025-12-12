/*
  # Fix user creation system completely

  1. Changes
    - Drop old conflicting RLS policies
    - Create proper RLS policies that work with trigger
    - Recreate trigger function with proper permissions
    - Add trigger to auth.users table

  2. Security
    - Trigger uses SECURITY DEFINER to bypass RLS
    - Users can only update their own records
    - All users can view all profiles (for social features)
*/

-- ============================================================================
-- STEP 1: Clean up old RLS policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Authenticated users can search other users" ON users;
DROP POLICY IF EXISTS "Users can select all profiles" ON users;
DROP POLICY IF EXISTS "Users can insert own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;

-- ============================================================================
-- STEP 2: Create new simplified RLS policies
-- ============================================================================
CREATE POLICY "Anyone can view profiles"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- STEP 3: Create trigger function with SECURITY DEFINER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  default_username text;
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

  -- Insert user profile (trigger bypasses RLS with SECURITY DEFINER)
  INSERT INTO public.users (id, email, username, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    default_username,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- STEP 4: Add trigger to auth.users
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
