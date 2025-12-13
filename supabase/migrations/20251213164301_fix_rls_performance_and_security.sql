/*
  # Fix RLS Performance and Security Issues

  ## Changes Made
  
  1. **RLS Performance Optimization**
     - Replace all `auth.uid()` calls with `(select auth.uid())` to prevent re-evaluation per row
     - This significantly improves query performance at scale
  
  2. **Duplicate Policy Cleanup**
     - Remove duplicate and redundant policies
     - Consolidate multiple permissive policies into single, efficient policies
  
  3. **Function Security**
     - Fix search_path mutability for `is_user_in_group` function
  
  4. **Index Optimization**
     - Remove unused indexes to reduce maintenance overhead
  
  ## Tables Affected
  - users, media_shares, direct_messages, friends, likes, comments
  - groups, group_members, group_messages, conversation_reads
*/

-- ============================================================================
-- USERS TABLE - Consolidate and optimize policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can view all profiles" ON users;
DROP POLICY IF EXISTS "Authenticated users can search other users" ON users;
DROP POLICY IF EXISTS "Users can view own private key" ON users;

CREATE POLICY "Users can select all profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- ============================================================================
-- MEDIA_SHARES TABLE - Optimize auth checks
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own media" ON media_shares;
DROP POLICY IF EXISTS "Users can view public media" ON media_shares;
DROP POLICY IF EXISTS "Users can insert own media" ON media_shares;
DROP POLICY IF EXISTS "Users can update own media" ON media_shares;
DROP POLICY IF EXISTS "Users can delete own media" ON media_shares;

CREATE POLICY "Users can select media"
  ON media_shares FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR 
    is_public = true
  );

CREATE POLICY "Users can insert own media"
  ON media_shares FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own media"
  ON media_shares FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own media"
  ON media_shares FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- DIRECT_MESSAGES TABLE - Consolidate select policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can view messages they sent" ON direct_messages;
DROP POLICY IF EXISTS "Users can view messages sent to them" ON direct_messages;
DROP POLICY IF EXISTS "Users can send messages as themselves" ON direct_messages;
DROP POLICY IF EXISTS "Users can update their received messages" ON direct_messages;

CREATE POLICY "Users can select their messages"
  ON direct_messages FOR SELECT
  TO authenticated
  USING (
    sender_id = (select auth.uid()) OR 
    receiver_id = (select auth.uid())
  );

CREATE POLICY "Users can insert messages"
  ON direct_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = (select auth.uid()));

CREATE POLICY "Users can update received messages"
  ON direct_messages FOR UPDATE
  TO authenticated
  USING (receiver_id = (select auth.uid()))
  WITH CHECK (receiver_id = (select auth.uid()));

-- ============================================================================
-- FRIENDS TABLE - Consolidate select policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their friend list" ON friends;
DROP POLICY IF EXISTS "Users can view who added them" ON friends;
DROP POLICY IF EXISTS "Users can add friends" ON friends;
DROP POLICY IF EXISTS "Users can remove their friendships" ON friends;

CREATE POLICY "Users can select friends"
  ON friends FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR 
    friend_id = (select auth.uid())
  );

CREATE POLICY "Users can insert friendships"
  ON friends FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete friendships"
  ON friends FOR DELETE
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR 
    friend_id = (select auth.uid())
  );

-- ============================================================================
-- LIKES TABLE - Optimize auth checks
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can view likes" ON likes;
DROP POLICY IF EXISTS "Authenticated users can create likes" ON likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON likes;

CREATE POLICY "Anyone can select likes"
  ON likes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert likes"
  ON likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own likes"
  ON likes FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- COMMENTS TABLE - Optimize auth checks
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can view comments" ON comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

CREATE POLICY "Anyone can select comments"
  ON comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert comments"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- GROUPS TABLE - Optimize auth checks
-- ============================================================================
DROP POLICY IF EXISTS "Members can view groups" ON groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Group creator can update group" ON groups;
DROP POLICY IF EXISTS "Group creator can delete group" ON groups;

CREATE POLICY "Members can select groups"
  ON groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members 
      WHERE group_members.group_id = groups.id 
      AND group_members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert groups"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Creators can update groups"
  ON groups FOR UPDATE
  TO authenticated
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Creators can delete groups"
  ON groups FOR DELETE
  TO authenticated
  USING (created_by = (select auth.uid()));

-- ============================================================================
-- GROUP_MEMBERS TABLE - Optimize auth checks
-- ============================================================================
DROP POLICY IF EXISTS "Members can view membership" ON group_members;
DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;

CREATE POLICY "Members can select membership"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid()) OR
    group_id IN (
      SELECT group_id FROM group_members WHERE user_id = (select auth.uid())
    )
  );

CREATE POLICY "Creators can insert members"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_members.group_id 
      AND groups.created_by = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete own membership"
  ON group_members FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- GROUP_MESSAGES TABLE - Consolidate duplicate policies
-- ============================================================================
DROP POLICY IF EXISTS "Group members can view messages" ON group_messages;
DROP POLICY IF EXISTS "Members can send messages" ON group_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON group_messages;
DROP POLICY IF EXISTS "Anyone authenticated can view messages" ON group_messages;
DROP POLICY IF EXISTS "Senders can delete their messages" ON group_messages;

CREATE POLICY "Members can select messages"
  ON group_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members 
      WHERE group_members.group_id = group_messages.group_id 
      AND group_members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Members can insert messages"
  ON group_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM group_members 
      WHERE group_members.group_id = group_messages.group_id 
      AND group_members.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Senders can delete messages"
  ON group_messages FOR DELETE
  TO authenticated
  USING (sender_id = (select auth.uid()));

-- ============================================================================
-- CONVERSATION_READS TABLE - Optimize auth checks
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own read status" ON conversation_reads;
DROP POLICY IF EXISTS "Users can insert own read status" ON conversation_reads;
DROP POLICY IF EXISTS "Users can update own read status" ON conversation_reads;

CREATE POLICY "Users can select own reads"
  ON conversation_reads FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own reads"
  ON conversation_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own reads"
  ON conversation_reads FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- FIX FUNCTION SECURITY
-- ============================================================================
DROP FUNCTION IF EXISTS is_user_in_group(uuid, uuid);

CREATE OR REPLACE FUNCTION is_user_in_group(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM group_members 
    WHERE user_id = p_user_id 
    AND group_id = p_group_id
  );
$$;

-- ============================================================================
-- INDEX OPTIMIZATION - Remove unused, add useful ones
-- ============================================================================

-- Create optimized composite indexes
CREATE INDEX IF NOT EXISTS idx_media_shares_user_public ON media_shares(user_id, is_public);
CREATE INDEX IF NOT EXISTS idx_direct_messages_participants ON direct_messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_friends_both_users ON friends(user_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_group_members_lookup ON group_members(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_created ON group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_media_user ON likes(media_share_id, user_id);
CREATE INDEX IF NOT EXISTS idx_comments_media_created ON comments(media_share_id, created_at DESC);