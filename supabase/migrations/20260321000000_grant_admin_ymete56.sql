-- Grant admin privileges to y.mete56@gmail.com
UPDATE public.users
SET is_admin = true
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'y.mete56@gmail.com'
);
