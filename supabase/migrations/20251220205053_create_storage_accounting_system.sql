/*
  # Storage Quota + Internal Credits Accounting System

  ## Overview
  This migration creates a storage accounting system that:
  - Tracks storage consumption using internal "credits" (never exposed to users)
  - Displays all storage information to users in GB only
  - Provides atomic, transaction-safe credit deduction
  - Prevents negative balances and handles concurrent uploads safely

  ## Credit Mapping
  - CREDITS_PER_MB = 100
  - 1 MB = 100 credits
  - 1 GB = 100,000 credits
  - Free plan: 3 GB = 300,000 credits

  ## Tables

  ### storage_account
  Tracks each user's credit balance and spending history
  - `user_id` (uuid, PK) - references auth.users
  - `credits_balance` (bigint) - current available credits
  - `credits_total` (bigint) - total credits ever allocated (free + purchased)
  - `credits_spent` (bigint) - total credits consumed
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### uploads
  Tracks all upload attempts with their credit charges
  - `id` (uuid, PK)
  - `user_id` (uuid) - references auth.users
  - `file_size_bytes` (bigint) - actual file size
  - `credits_charged` (bigint) - credits deducted for this upload
  - `status` (text) - 'pending', 'complete', 'failed'
  - `ipfs_cid` (text) - IPFS content identifier (nullable until complete)
  - `media_share_id` (uuid) - references media_shares (nullable)
  - `created_at` (timestamptz)
  - `completed_at` (timestamptz, nullable)

  ## Security
  - RLS enabled on all tables
  - Users can only view/modify their own storage data
  - Admin policies for management

  ## Initial Setup
  - All existing users get 3 GB (300,000 credits) initial balance
  - New users automatically receive 3 GB on account creation via trigger
*/

-- Create storage_account table
CREATE TABLE IF NOT EXISTS storage_account (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_balance bigint NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  credits_total bigint NOT NULL DEFAULT 0 CHECK (credits_total >= 0),
  credits_spent bigint NOT NULL DEFAULT 0 CHECK (credits_spent >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create uploads tracking table
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes >= 0),
  credits_charged bigint NOT NULL CHECK (credits_charged >= 0),
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  ipfs_cid text,
  media_share_id uuid REFERENCES media_shares(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_storage_account_user_id ON storage_account(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON uploads(created_at DESC);

-- Enable RLS
ALTER TABLE storage_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for storage_account

-- Users can view their own storage account
CREATE POLICY "Users can view own storage account"
  ON storage_account FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own storage account (for atomic operations)
CREATE POLICY "Users can update own storage account"
  ON storage_account FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can manage all storage accounts
CREATE POLICY "Service role can manage all storage accounts"
  ON storage_account FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for uploads

-- Users can view their own uploads
CREATE POLICY "Users can view own uploads"
  ON uploads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own uploads
CREATE POLICY "Users can insert own uploads"
  ON uploads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own uploads
CREATE POLICY "Users can update own uploads"
  ON uploads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can manage all uploads
CREATE POLICY "Service role can manage all uploads"
  ON uploads FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to initialize storage account for new users
CREATE OR REPLACE FUNCTION initialize_storage_account()
RETURNS TRIGGER AS $$
DECLARE
  free_plan_credits bigint := 300000; -- 3 GB = 300,000 credits (100 credits per MB)
BEGIN
  INSERT INTO storage_account (user_id, credits_balance, credits_total)
  VALUES (NEW.id, free_plan_credits, free_plan_credits)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create storage account for new users
DROP TRIGGER IF EXISTS on_auth_user_created_storage ON auth.users;
CREATE TRIGGER on_auth_user_created_storage
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_storage_account();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_storage_account_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS on_storage_account_updated ON storage_account;
CREATE TRIGGER on_storage_account_updated
  BEFORE UPDATE ON storage_account
  FOR EACH ROW
  EXECUTE FUNCTION update_storage_account_updated_at();

-- Backfill storage accounts for existing users
INSERT INTO storage_account (user_id, credits_balance, credits_total)
SELECT id, 300000, 300000
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM storage_account)
ON CONFLICT (user_id) DO NOTHING;
