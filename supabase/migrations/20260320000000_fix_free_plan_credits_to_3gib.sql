-- Fix free plan credits from 300,000 to 307,200 (exact 3 GiB)
-- Previous value: 300,000 credits = 3,000 MB = ~2.93 GiB (shown to user as 2.93 GB)
-- Correct value:  307,200 credits = 3,072 MB = 3.00 GiB (shown to user as 3.00 GB)

-- Update the initialization function for new users
CREATE OR REPLACE FUNCTION initialize_storage_account()
RETURNS TRIGGER AS $$
DECLARE
  free_plan_credits bigint := 307200; -- 3 GiB = 3 * 1024 MB * 100 credits/MB
BEGIN
  INSERT INTO storage_account (user_id, credits_balance, credits_total)
  VALUES (NEW.id, free_plan_credits, free_plan_credits)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing users who got 300,000 credits: top them up by 7,200
UPDATE storage_account
SET
  credits_balance = credits_balance + 7200,
  credits_total   = credits_total   + 7200,
  updated_at      = now()
WHERE credits_total = 300000;
