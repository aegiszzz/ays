/*
  # Add Update Policy for Access Codes

  1. Security Updates
    - Add policy for anonymous users to update (mark as used) access codes during signup
    - This allows the registration flow to mark codes as used
*/

CREATE POLICY "Allow anonymous to mark code as used"
  ON access_codes
  FOR UPDATE
  TO anon
  USING (used = false)
  WITH CHECK (used = true);
