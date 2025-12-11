/*
  # Backfill notifications from past activities

  1. Overview
    - Creates notifications for existing likes, comments, and follows
    - Only creates notifications for activities that don't already have one
    - Does not send duplicate notifications

  2. Process
    - Insert notifications for past likes
    - Insert notifications for past comments  
    - Insert notifications for past follows (friends with accepted status)

  3. Notes
    - Uses INSERT with ON CONFLICT DO NOTHING to avoid duplicates
    - Only creates notifications where the actor is different from the target user
    - Limits to recent activities to avoid overwhelming users
*/

-- Create notifications for past likes (last 30 days)
INSERT INTO notifications (user_id, type, related_user_id, related_item_id, content, created_at)
SELECT DISTINCT
  ms.user_id,
  'like',
  l.user_id,
  l.media_share_id,
  NULL,
  l.created_at
FROM likes l
JOIN media_shares ms ON ms.id = l.media_share_id
WHERE l.user_id != ms.user_id
  AND l.created_at > NOW() - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.user_id = ms.user_id
      AND n.type = 'like'
      AND n.related_user_id = l.user_id
      AND n.related_item_id = l.media_share_id
  );

-- Create notifications for past comments (last 30 days)
INSERT INTO notifications (user_id, type, related_user_id, related_item_id, content, created_at)
SELECT DISTINCT
  ms.user_id,
  'comment',
  c.user_id,
  c.media_share_id,
  SUBSTRING(c.content, 1, 50),
  c.created_at
FROM comments c
JOIN media_shares ms ON ms.id = c.media_share_id
WHERE c.user_id != ms.user_id
  AND c.created_at > NOW() - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.user_id = ms.user_id
      AND n.type = 'comment'
      AND n.related_user_id = c.user_id
      AND n.related_item_id = c.media_share_id
      AND n.created_at = c.created_at
  );

-- Create notifications for past follows (last 30 days)
INSERT INTO notifications (user_id, type, related_user_id, related_item_id, content, created_at)
SELECT DISTINCT
  f.friend_id,
  'follow',
  f.user_id,
  NULL::uuid,
  NULL,
  f.created_at
FROM friends f
WHERE f.status = 'accepted'
  AND f.user_id != f.friend_id
  AND f.created_at > NOW() - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.user_id = f.friend_id
      AND n.type = 'follow'
      AND n.related_user_id = f.user_id
      AND n.created_at = f.created_at
  );
