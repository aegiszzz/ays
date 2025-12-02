/*
  # Fix Remaining Security and Performance Issues

  ## Changes Made
  
  1. **Foreign Key Indexes**
     - Add covering indexes for all unindexed foreign keys
     - Improves JOIN performance and referential integrity checks
  
  2. **Remove Unused Indexes**
     - Clean up indexes that haven't been used
     - Reduces maintenance overhead
  
  3. **Fix Duplicate Policies**
     - Remove duplicate permissive policies
     - Ensures single, clear access control per action
  
  ## Tables Affected
  - app_users, wallets, media_files, media_access
  - comments, group_messages, group_members
  - groups, likes
*/

-- ============================================================================
-- ADD MISSING FOREIGN KEY INDEXES
-- ============================================================================

-- app_users table
CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id 
  ON app_users(auth_user_id);

-- comments table
CREATE INDEX IF NOT EXISTS idx_comments_user_id 
  ON comments(user_id);

-- group_messages table
CREATE INDEX IF NOT EXISTS idx_group_messages_sender_id 
  ON group_messages(sender_id);

-- media_access table
CREATE INDEX IF NOT EXISTS idx_media_access_user_id 
  ON media_access(user_id);

-- media_files table
CREATE INDEX IF NOT EXISTS idx_media_files_user_id 
  ON media_files(user_id);

-- wallets table
CREATE INDEX IF NOT EXISTS idx_wallets_user_id 
  ON wallets(user_id);

-- ============================================================================
-- REMOVE UNUSED COMPOSITE INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_friends_both_users;
DROP INDEX IF EXISTS idx_media_shares_user_public;
DROP INDEX IF EXISTS idx_likes_media_user;
DROP INDEX IF EXISTS idx_comments_media_created;
DROP INDEX IF EXISTS idx_direct_messages_participants;
DROP INDEX IF EXISTS idx_group_members_lookup;
DROP INDEX IF EXISTS idx_group_messages_group_created;

-- ============================================================================
-- FIX DUPLICATE POLICIES - COMMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can read all comments" ON comments;
-- Keep: "Anyone can select comments"

-- ============================================================================
-- FIX DUPLICATE POLICIES - GROUP_MEMBERS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Anyone authenticated can add members" ON group_members;
-- Keep: "Creators can insert members" (more restrictive)

DROP POLICY IF EXISTS "Anyone authenticated can view members" ON group_members;
-- Keep: "Members can select membership" (more restrictive)

-- ============================================================================
-- FIX DUPLICATE POLICIES - GROUPS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Anyone authenticated can create groups" ON groups;
-- Keep: "Users can insert groups"

DROP POLICY IF EXISTS "Anyone authenticated can view all groups" ON groups;
-- Keep: "Members can select groups" (more restrictive)

-- ============================================================================
-- FIX DUPLICATE POLICIES - LIKES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can read all likes" ON likes;
-- Keep: "Anyone can select likes"

-- ============================================================================
-- ADD USEFUL PERFORMANCE INDEXES
-- ============================================================================

-- Optimize common query patterns
CREATE INDEX IF NOT EXISTS idx_media_shares_user_id 
  ON media_shares(user_id) 
  WHERE is_public = true;

CREATE INDEX IF NOT EXISTS idx_media_shares_created_at 
  ON media_shares(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_media_share_id 
  ON likes(media_share_id);

CREATE INDEX IF NOT EXISTS idx_comments_media_share_id 
  ON comments(media_share_id);

CREATE INDEX IF NOT EXISTS idx_friends_user_id 
  ON friends(user_id);

CREATE INDEX IF NOT EXISTS idx_friends_friend_id 
  ON friends(friend_id);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id 
  ON group_members(user_id);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id 
  ON group_members(group_id);

CREATE INDEX IF NOT EXISTS idx_group_messages_group_id 
  ON group_messages(group_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id 
  ON direct_messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver_id 
  ON direct_messages(receiver_id);

-- Optimize conversation reads
CREATE INDEX IF NOT EXISTS idx_conversation_reads_user_conversation 
  ON conversation_reads(user_id, conversation_id);
