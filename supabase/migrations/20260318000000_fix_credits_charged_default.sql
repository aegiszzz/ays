-- Add DEFAULT 0 to credits_charged so begin-upload inserts don't fail
-- credits_charged is set to the actual amount during finalize-upload
ALTER TABLE uploads ALTER COLUMN credits_charged SET DEFAULT 0;
