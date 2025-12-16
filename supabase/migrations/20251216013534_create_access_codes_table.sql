/*
  # Create Access Codes Table for Beta Registration

  1. New Tables
    - `access_codes`
      - `id` (uuid, primary key)
      - `code` (text, unique) - 6-digit access code
      - `used` (boolean) - whether the code has been used
      - `used_by` (uuid, nullable) - reference to user who used the code
      - `used_at` (timestamptz, nullable) - when the code was used
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `access_codes` table
    - Add policy for service role to manage codes
    - Add policy for anonymous users to validate codes during signup
*/

CREATE TABLE IF NOT EXISTS access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  used boolean DEFAULT false,
  used_by uuid REFERENCES auth.users(id),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to check code validity"
  ON access_codes
  FOR SELECT
  TO anon
  USING (used = false);

CREATE POLICY "Allow authenticated to view own used code"
  ON access_codes
  FOR SELECT
  TO authenticated
  USING (used_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_used ON access_codes(used);
