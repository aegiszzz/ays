/*
  # Fix Comprehensive Security Issues
  
  ## Changes Applied
  
  ### 1. Add Missing Foreign Key Indexes
  - access_codes.used_by
  - account_status.frozen_by
  - notifications.related_user_id
  - uploads.media_share_id
  - user_points.task_id
  
  ### 2. Fix RLS Performance Issues
  Wrap all auth.uid() calls with (SELECT auth.uid()) in RLS policies for:
  - account_status (2 policies)
  - media_access (2 policies)
  - verification_codes (2 policies)
  - purchases (1 policy)
  - uploads (3 policies)
  - group_members (1 policy)
  - users (2 policies)
  - access_codes (1 policy)
  - tasks (2 policies)
  - user_tasks (3 policies)
  - user_points (2 policies)
  - storage_account (2 policies)
  - storage_ledger (1 policy)
  
  ### 3. Drop Unused Indexes
  Remove 24 unused indexes that are not being utilized
  
  ### 4. Consolidate Multiple Permissive Policies
  - Merge duplicate policies on tasks, user_points, and users tables
  
  ### 5. Fix Security Definer Views
  Recreate views without SECURITY DEFINER where possible
  
  ### 6. Fix Function Search Path
  Set immutable search_path for all functions
  
  ### 7. Enable RLS on rate_limit_config
  
  ## Notes
  - All changes maintain existing functionality while improving security and performance
  - Backed by Supabase security best practices
*/

-- =====================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_access_codes_used_by ON public.access_codes(used_by);
CREATE INDEX IF NOT EXISTS idx_account_status_frozen_by ON public.account_status(frozen_by);
CREATE INDEX IF NOT EXISTS idx_notifications_related_user_id ON public.notifications(related_user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_media_share_id_fk ON public.uploads(media_share_id);
CREATE INDEX IF NOT EXISTS idx_user_points_task_id ON public.user_points(task_id);

-- =====================================================
-- 2. DROP UNUSED INDEXES
-- =====================================================

DROP INDEX IF EXISTS idx_rate_limits_user_endpoint_window;
DROP INDEX IF EXISTS idx_direct_messages_created_at;
DROP INDEX IF EXISTS idx_uploads_user_id;
DROP INDEX IF EXISTS idx_uploads_status;
DROP INDEX IF EXISTS idx_uploads_created_at;
DROP INDEX IF EXISTS storage_ledger_user_id_created_at_idx;
DROP INDEX IF EXISTS storage_ledger_upload_id_idx;
DROP INDEX IF EXISTS idx_conversation_reads_user;
DROP INDEX IF EXISTS idx_verification_codes_email;
DROP INDEX IF EXISTS idx_likes_media_share;
DROP INDEX IF EXISTS idx_comments_media_share;
DROP INDEX IF EXISTS idx_comments_user;
DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_created_at;
DROP INDEX IF EXISTS idx_notifications_read;
DROP INDEX IF EXISTS idx_users_is_admin;
DROP INDEX IF EXISTS idx_group_members_group_id;
DROP INDEX IF EXISTS idx_group_messages_group_id;
DROP INDEX IF EXISTS idx_group_messages_created_at;
DROP INDEX IF EXISTS idx_access_codes_used;
DROP INDEX IF EXISTS idx_media_shares_processing_status;
DROP INDEX IF EXISTS idx_user_tasks_completed_at;
DROP INDEX IF EXISTS idx_user_points_user_id;
DROP INDEX IF EXISTS idx_user_points_created_at;
DROP INDEX IF EXISTS idx_purchases_user_id;
DROP INDEX IF EXISTS idx_purchases_created_at;

-- =====================================================
-- 3. FIX RLS POLICIES - ACCOUNT_STATUS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own account status" ON public.account_status;
CREATE POLICY "Users can view own account status"
  ON public.account_status
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can update account status" ON public.account_status;
CREATE POLICY "Admins can update account status"
  ON public.account_status
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

-- =====================================================
-- 4. FIX RLS POLICIES - MEDIA_ACCESS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own access records" ON public.media_access;
CREATE POLICY "Users can view own access records"
  ON public.media_access
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete access records" ON public.media_access;
CREATE POLICY "Users can delete access records"
  ON public.media_access
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- 5. FIX RLS POLICIES - VERIFICATION_CODES
-- =====================================================

DROP POLICY IF EXISTS "Users can update own verification codes" ON public.verification_codes;
CREATE POLICY "Users can update own verification codes"
  ON public.verification_codes
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can read own verification codes" ON public.verification_codes;
CREATE POLICY "Users can read own verification codes"
  ON public.verification_codes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- 6. FIX RLS POLICIES - PURCHASES
-- =====================================================

DROP POLICY IF EXISTS "Users can view own purchases" ON public.purchases;
CREATE POLICY "Users can view own purchases"
  ON public.purchases
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- 7. FIX RLS POLICIES - UPLOADS
-- =====================================================

DROP POLICY IF EXISTS "Users can update own uploads" ON public.uploads;
CREATE POLICY "Users can update own uploads"
  ON public.uploads
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own uploads" ON public.uploads;
CREATE POLICY "Users can view own uploads"
  ON public.uploads
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own uploads" ON public.uploads;
CREATE POLICY "Users can insert own uploads"
  ON public.uploads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- =====================================================
-- 8. FIX RLS POLICIES - GROUP_MEMBERS
-- =====================================================

DROP POLICY IF EXISTS "Members can view group membership" ON public.group_members;
CREATE POLICY "Members can view group membership"
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 9. FIX RLS POLICIES - ACCESS_CODES
-- =====================================================

DROP POLICY IF EXISTS "Allow authenticated to view own used code" ON public.access_codes;
CREATE POLICY "Allow authenticated to view own used code"
  ON public.access_codes
  FOR SELECT
  TO authenticated
  USING (used_by = (SELECT auth.uid()));

-- =====================================================
-- 10. FIX RLS POLICIES - USER_TASKS
-- =====================================================

DROP POLICY IF EXISTS "Users can view own task completions" ON public.user_tasks;
CREATE POLICY "Users can view own task completions"
  ON public.user_tasks
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own task completions" ON public.user_tasks;
CREATE POLICY "Users can insert own task completions"
  ON public.user_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own task completions" ON public.user_tasks;
CREATE POLICY "Users can update own task completions"
  ON public.user_tasks
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- 11. FIX RLS POLICIES - STORAGE_ACCOUNT
-- =====================================================

DROP POLICY IF EXISTS "Users can view own storage account" ON public.storage_account;
CREATE POLICY "Users can view own storage account"
  ON public.storage_account
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own storage account" ON public.storage_account;
CREATE POLICY "Users can update own storage account"
  ON public.storage_account
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- 12. FIX RLS POLICIES - STORAGE_LEDGER
-- =====================================================

DROP POLICY IF EXISTS "Users can view own ledger entries" ON public.storage_ledger;
CREATE POLICY "Users can view own ledger entries"
  ON public.storage_ledger
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- =====================================================
-- 13. CONSOLIDATE MULTIPLE PERMISSIVE POLICIES - TASKS
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view active tasks" ON public.tasks;
DROP POLICY IF EXISTS "Only admins can manage tasks" ON public.tasks;

CREATE POLICY "Authenticated users can view active tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins have full access to tasks"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

-- =====================================================
-- 14. CONSOLIDATE MULTIPLE PERMISSIVE POLICIES - USER_POINTS
-- =====================================================

DROP POLICY IF EXISTS "Users can view leaderboard" ON public.user_points;
DROP POLICY IF EXISTS "Users can view own points history" ON public.user_points;

CREATE POLICY "Users can view all points for leaderboard and own history"
  ON public.user_points
  FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- 15. CONSOLIDATE MULTIPLE PERMISSIVE POLICIES - USERS
-- =====================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.users;
DROP POLICY IF EXISTS "Users can select all profiles" ON public.users;

CREATE POLICY "Users can insert own profile only"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can view all profiles"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- 16. ENABLE RLS ON RATE_LIMIT_CONFIG
-- =====================================================

ALTER TABLE public.rate_limit_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage rate limit config"
  ON public.rate_limit_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = (SELECT auth.uid()) AND is_admin = true
    )
  );

CREATE POLICY "Authenticated users can view rate limit config"
  ON public.rate_limit_config
  FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- 17. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Trigger functions (no parameters)
ALTER FUNCTION public.initialize_storage_account() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_storage_account_updated_at() SET search_path = public, pg_temp;

-- Storage functions with specific signatures
ALTER FUNCTION public.finalize_upload_transaction(uuid, uuid, bigint, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.reserve_credits_for_upload(uuid, bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.release_credits_for_failed_upload(uuid, uuid, bigint) SET search_path = public, pg_temp;

-- Rate limiting and account functions
ALTER FUNCTION public.check_rate_limit(uuid, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.freeze_account(uuid, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.unfreeze_account(uuid) SET search_path = public, pg_temp;

-- Credits function (with idempotency - 7 parameters)
ALTER FUNCTION public.add_storage_credits(uuid, bigint, text, text, bigint, decimal, jsonb) SET search_path = public, pg_temp;

-- =====================================================
-- 18. RECREATE SECURITY DEFINER VIEWS
-- =====================================================

-- Drop and recreate storage_account_with_email without SECURITY DEFINER
DROP VIEW IF EXISTS public.storage_account_with_email CASCADE;
CREATE VIEW public.storage_account_with_email AS
SELECT 
  sa.*,
  u.email
FROM public.storage_account sa
JOIN public.users u ON sa.user_id = u.id;

-- Grant appropriate permissions
GRANT SELECT ON public.storage_account_with_email TO authenticated;

-- Drop and recreate storage_account_available without SECURITY DEFINER
DROP VIEW IF EXISTS public.storage_account_available CASCADE;
CREATE VIEW public.storage_account_available AS
SELECT 
  user_id,
  credits_balance - credits_reserved AS available_credits
FROM public.storage_account;

-- Grant appropriate permissions
GRANT SELECT ON public.storage_account_available TO authenticated;

-- Drop and recreate media_shares_feed without SECURITY DEFINER
DROP VIEW IF EXISTS public.media_shares_feed CASCADE;
CREATE VIEW public.media_shares_feed AS
SELECT 
  ms.*,
  u.username,
  u.avatar_url,
  (SELECT COUNT(*) FROM public.likes WHERE media_share_id = ms.id) AS likes_count,
  (SELECT COUNT(*) FROM public.comments WHERE media_share_id = ms.id) AS comments_count
FROM public.media_shares ms
JOIN public.users u ON ms.user_id = u.id
WHERE ms.processing_status = 'completed';

-- Grant appropriate permissions
GRANT SELECT ON public.media_shares_feed TO authenticated;
