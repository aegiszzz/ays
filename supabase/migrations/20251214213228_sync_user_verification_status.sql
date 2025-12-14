/*
  # Sync User Verification Status

  1. Updates
    - Sync `email_verified` status from auth.users to public.users
    - Ensures existing users have correct verification status

  2. Changes
    - Updates all users where auth.users.email_confirmed_at is not null
    - Sets public.users.email_verified to true for verified users
*/

UPDATE public.users pu
SET email_verified = true
FROM auth.users au
WHERE pu.id = au.id 
  AND au.email_confirmed_at IS NOT NULL
  AND pu.email_verified = false;
