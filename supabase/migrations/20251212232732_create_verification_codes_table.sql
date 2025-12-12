/*
  # Email Verification System

  1. New Tables
    - `verification_codes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `code` (text, 6-digit verification code)
      - `email` (text, email address)
      - `expires_at` (timestamptz, expiration time)
      - `verified` (boolean, verification status)
      - `created_at` (timestamptz, creation time)
  
  2. Security
    - Enable RLS on `verification_codes` table
    - Add policy for users to read their own verification codes
    - Add policy for service role to insert verification codes
  
  3. Indexes
    - Index on user_id for fast lookups
    - Index on code for verification
*/

CREATE TABLE IF NOT EXISTS verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own verification codes"
  ON verification_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert verification codes"
  ON verification_codes
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can update own verification codes"
  ON verification_codes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);