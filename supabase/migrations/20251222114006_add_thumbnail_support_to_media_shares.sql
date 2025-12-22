/*
  # Add Thumbnail Support to Media Shares

  Adds thumbnail and preview image support for bandwidth optimization.

  ## Problem
  Without thumbnails, feed loads full-resolution images causing massive bandwidth consumption.

  ## Solution
  Store multiple versions of each asset:
  - thumbnail_cid: 300x300px thumbnail for feed/grid
  - preview_cid: 600x600px preview for detail view (optional)
  - ipfs_cid: Full resolution (loaded on demand)

  ## Changes
  1. Add thumbnail_cid to media_shares
  2. Add preview_cid to media_shares
  3. Add video_poster_cid for video thumbnails
  4. Add processing_status to track thumbnail generation

  ## Benefits
  - Feed bandwidth: 95% reduction (40 KB vs 2 MB per image)
  - Better UX: Fast loading feed
  - Cost savings: Stay within Pinata 500 GB/month limit
*/

-- Add thumbnail columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_shares' AND column_name = 'thumbnail_cid'
  ) THEN
    ALTER TABLE media_shares ADD COLUMN thumbnail_cid text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_shares' AND column_name = 'preview_cid'
  ) THEN
    ALTER TABLE media_shares ADD COLUMN preview_cid text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_shares' AND column_name = 'video_poster_cid'
  ) THEN
    ALTER TABLE media_shares ADD COLUMN video_poster_cid text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'media_shares' AND column_name = 'processing_status'
  ) THEN
    ALTER TABLE media_shares ADD COLUMN processing_status text DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'complete', 'failed'));
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN media_shares.thumbnail_cid IS 'IPFS CID of 300x300px thumbnail for feed display (bandwidth optimization)';
COMMENT ON COLUMN media_shares.preview_cid IS 'IPFS CID of 600x600px preview for detail view (optional)';
COMMENT ON COLUMN media_shares.video_poster_cid IS 'IPFS CID of video poster frame (first frame thumbnail)';
COMMENT ON COLUMN media_shares.processing_status IS 'Thumbnail generation status: pending, processing, complete, failed';

-- Create index for processing status queries
CREATE INDEX IF NOT EXISTS idx_media_shares_processing_status 
ON media_shares(processing_status) 
WHERE processing_status IN ('pending', 'processing');

-- Create view for feed queries (returns thumbnail first, falls back to original)
CREATE OR REPLACE VIEW media_shares_feed AS
SELECT
  ms.id,
  ms.user_id,
  ms.caption,
  ms.media_type,
  COALESCE(ms.thumbnail_cid, ms.ipfs_cid) AS display_cid,
  ms.ipfs_cid AS full_cid,
  ms.thumbnail_cid,
  ms.preview_cid,
  ms.video_poster_cid,
  ms.created_at,
  u.username,
  u.avatar_url
FROM media_shares ms
JOIN users u ON u.id = ms.user_id;

COMMENT ON VIEW media_shares_feed IS 'Optimized view for feed queries with thumbnail fallback';
