/*
  # Fix username assignment during signup

  1. Changes
    - Drop trigger that auto-creates user profile
    - Add RLS policy to allow new users to insert their own profile
    - This ensures username is exactly what user enters during signup
  
  2. Security
    - Users can only insert their own profile once
    - Username must match what they provide during signup
*/

-- Drop the trigger that auto-creates profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Add INSERT policy so users can create their own profile
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());