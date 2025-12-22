# Bandwidth Optimization Guide for Pinata Integration

## Critical Context

**Pinata Plan**: 500 GB bandwidth/month (Gateway requests)

**Risk**: Storage accounting is solid, but **bandwidth is the actual cost driver**. Without optimization, 500 GB can be consumed in days.

## Problem

Current storage system tracks **upload size** (controlled) but not **download bandwidth** (uncontrolled).

### Example Scenario (Without Optimization)

- User uploads 100 MB video → Charges 100 credits ✅
- Feed loads video 1000 times → Uses 100 GB bandwidth ❌
- **Result**: Upload accounting works, but bandwidth explodes

## Frontend Requirements

### 1. Thumbnail/Preview System (Critical)

**Problem**: Feed loads full-resolution images/videos.

**Solution**: Generate and use thumbnails/previews.

```typescript
// ❌ BAD: Loading full file in feed
<Image source={{ uri: `${PINATA_GATEWAY}/${ipfs_cid}` }} />

// ✅ GOOD: Loading thumbnail
<Image source={{ uri: `${PINATA_GATEWAY}/${thumbnail_cid}` }} />
```

**Implementation Options**:

**Option A**: Client-side thumbnail generation
```typescript
// On upload, generate thumbnail locally
const thumbnail = await generateThumbnail(imageUri, {
  width: 300,
  quality: 0.7
});

// Upload both original and thumbnail
const originalCid = await uploadToIPFS(imageUri);
const thumbnailCid = await uploadToIPFS(thumbnail);

// Save both CIDs
await supabase.from('media_shares').insert({
  ipfs_cid: originalCid,
  thumbnail_cid: thumbnailCid,
  media_type: 'image'
});
```

**Option B**: Server-side thumbnail generation (Recommended)
```typescript
// Edge function: process-upload
// After IPFS upload, generate thumbnail
const originalCid = await uploadToIPFS(fileData);
const thumbnail = await generateThumbnail(fileData);
const thumbnailCid = await uploadToIPFS(thumbnail);

return { originalCid, thumbnailCid };
```

**Thumbnail Specs**:
- Images: 300x300px, JPEG quality 70%
- Videos: First frame as thumbnail, 300x300px
- Estimated size: 20-50 KB vs 1-5 MB original
- **Bandwidth saving: 95%+**

### 2. Video Autoplay (Critical)

**Problem**: Feed autoplays videos = massive bandwidth.

**Solution**: Disable autoplay, show thumbnail with play button.

```typescript
// ❌ BAD: Autoplay
<Video
  source={{ uri: `${PINATA_GATEWAY}/${ipfs_cid}` }}
  shouldPlay={true}
  isLooping={true}
/>

// ✅ GOOD: Manual play with thumbnail
<Pressable onPress={() => setPlaying(true)}>
  {!playing ? (
    <Image source={{ uri: `${PINATA_GATEWAY}/${thumbnail_cid}` }} />
  ) : (
    <Video
      source={{ uri: `${PINATA_GATEWAY}/${ipfs_cid}` }}
      shouldPlay={true}
    />
  )}
</Pressable>
```

**Autoplay Settings**:
- Feed: ❌ No autoplay
- Profile grid: ❌ No autoplay
- Single post view: ✅ Autoplay OK (user intent clear)
- Story mode: ✅ Autoplay OK (user initiated)

### 3. Infinite Scroll / Pagination (Critical)

**Problem**: Loading all feed items at once.

**Solution**: Paginate feed, load 10-20 items at a time.

```typescript
// ❌ BAD: Loading all shares
const { data } = await supabase
  .from('media_shares')
  .select('*')
  .order('created_at', { ascending: false });

// ✅ GOOD: Paginated with limit
const { data } = await supabase
  .from('media_shares')
  .select('*')
  .order('created_at', { ascending: false })
  .range(page * 20, (page + 1) * 20 - 1);
```

**Feed Settings**:
- Initial load: 20 items
- Infinite scroll: Load 10 more on scroll
- Never load more than 50 items at once

### 4. Image Resize on Display (Important)

**Problem**: Displaying 4K image in 300px container.

**Solution**: Use thumbnail or resize query parameter.

```typescript
// ❌ BAD: Full resolution in small container
<Image
  source={{ uri: `${PINATA_GATEWAY}/${ipfs_cid}` }}
  style={{ width: 300, height: 300 }}
/>

// ✅ GOOD: Thumbnail or resize parameter
<Image
  source={{ uri: `${PINATA_GATEWAY}/${thumbnail_cid}` }}
  style={{ width: 300, height: 300 }}
/>

// OR if Pinata supports resize query
<Image
  source={{ uri: `${PINATA_GATEWAY}/${ipfs_cid}?w=300` }}
  style={{ width: 300, height: 300 }}
/>
```

### 5. Prefetch Control (Important)

**Problem**: Aggressive prefetching of next items.

**Solution**: Conservative prefetch strategy.

```typescript
// ❌ BAD: Prefetching everything
items.forEach(item => {
  Image.prefetch(`${PINATA_GATEWAY}/${item.ipfs_cid}`);
});

// ✅ GOOD: Prefetch only next 2-3 items
const nextItems = items.slice(currentIndex + 1, currentIndex + 4);
nextItems.forEach(item => {
  Image.prefetch(`${PINATA_GATEWAY}/${item.thumbnail_cid}`);
});
```

**Prefetch Strategy**:
- Feed: Prefetch next 3 thumbnails only
- Single post: Prefetch next post thumbnail
- Gallery: No prefetch (user controls navigation)

### 6. Caching Strategy (Important)

**Problem**: Re-downloading same files repeatedly.

**Solution**: Implement proper caching headers and local cache.

```typescript
// Use expo-file-system for local cache
import * as FileSystem from 'expo-file-system';

const cacheImage = async (ipfsCid: string) => {
  const cacheDir = `${FileSystem.cacheDirectory}ipfs/`;
  const cacheFile = `${cacheDir}${ipfsCid}`;

  // Check if already cached
  const info = await FileSystem.getInfoAsync(cacheFile);
  if (info.exists) {
    return cacheFile;
  }

  // Download and cache
  await FileSystem.downloadAsync(
    `${PINATA_GATEWAY}/${ipfsCid}`,
    cacheFile
  );

  return cacheFile;
};
```

**Cache Settings**:
- Thumbnail: Cache for 7 days
- Full image: Cache for 3 days
- Video: Cache for 1 day (large file)
- Cache size limit: 500 MB

### 7. Lazy Loading (Important)

**Problem**: All images loading at once.

**Solution**: Load images as they enter viewport.

```typescript
import { useInView } from 'react-native-intersection-observer';

const LazyImage = ({ ipfsCid, thumbnailCid }) => {
  const [ref, inView] = useInView();

  return (
    <View ref={ref}>
      {inView ? (
        <Image source={{ uri: `${PINATA_GATEWAY}/${thumbnailCid}` }} />
      ) : (
        <View style={{ backgroundColor: '#f0f0f0', width: 300, height: 300 }} />
      )}
    </View>
  );
};
```

## Backend Requirements

### 1. Thumbnail Generation Service

Create edge function or use Pinata's built-in features:

```typescript
// supabase/functions/generate-thumbnail/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

Deno.serve(async (req: Request) => {
  const { ipfs_cid, media_type } = await req.json();

  // Download from Pinata
  const response = await fetch(`${PINATA_GATEWAY}/${ipfs_cid}`);
  const buffer = await response.arrayBuffer();

  // Generate thumbnail based on media_type
  let thumbnail;
  if (media_type === 'image') {
    thumbnail = await generateImageThumbnail(buffer);
  } else if (media_type === 'video') {
    thumbnail = await generateVideoThumbnail(buffer);
  }

  // Upload thumbnail to Pinata
  const thumbnailCid = await uploadToPinata(thumbnail);

  return Response.json({ thumbnail_cid: thumbnailCid });
});
```

### 2. Database Schema Update

Add thumbnail_cid to media_shares:

```sql
ALTER TABLE media_shares
ADD COLUMN thumbnail_cid text;

COMMENT ON COLUMN media_shares.thumbnail_cid IS 'IPFS CID of thumbnail/preview (300x300px)';
```

### 3. Migration Strategy

For existing media:

```sql
-- Find media without thumbnails
SELECT id, ipfs_cid, media_type
FROM media_shares
WHERE thumbnail_cid IS NULL;

-- Batch generate thumbnails (run via cron job)
-- Call generate-thumbnail edge function for each
```

## Monitoring Bandwidth Usage

### Pinata Dashboard Metrics

Monitor these in Pinata dashboard:
- **Bandwidth usage** (most important)
- Gateway requests count
- Popular CIDs (cache hits)

### Database Tracking (Optional)

Track downloads for analytics:

```sql
CREATE TABLE download_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_share_id uuid REFERENCES media_shares(id),
  user_id uuid REFERENCES auth.users(id),
  is_thumbnail boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Don't log every download (too expensive)
-- Sample 1% of downloads for analytics
```

## Bandwidth Budget Calculation

**Pinata Plan**: 500 GB/month = ~16.6 GB/day

### Scenario Analysis

**Without Optimization** (Worst Case):
- 1000 users
- Each views 50 posts/day
- Each post: 2 MB image
- **Daily bandwidth**: 1000 × 50 × 2 MB = 100 GB/day
- **Monthly**: 3000 GB → **6x over limit** ❌

**With Thumbnails** (Best Case):
- 1000 users
- Each views 50 posts/day (thumbnails)
- Each thumbnail: 40 KB
- Full image view: 10% of posts (5 posts/day)
- **Daily bandwidth**:
  - Thumbnails: 1000 × 50 × 0.04 MB = 2 GB/day
  - Full images: 1000 × 5 × 2 MB = 10 GB/day
  - **Total**: 12 GB/day
- **Monthly**: 360 GB → **Within limit** ✅

**Bandwidth Savings**: 88% reduction

## Implementation Priority

### Phase 1: Critical (Deploy Immediately)

1. ✅ Thumbnail generation on upload
2. ✅ Feed uses thumbnails only
3. ✅ Disable video autoplay
4. ✅ Basic pagination (20 items)

**Expected Savings**: 80-90%

### Phase 2: Important (Deploy Week 1)

1. Image resize on display
2. Lazy loading for feed
3. Prefetch control
4. Cache strategy

**Expected Savings**: Additional 5-10%

### Phase 3: Optimization (Deploy Week 2)

1. Download tracking
2. Popular content CDN
3. Thumbnail quality tuning
4. Video compression

**Expected Savings**: Additional 2-5%

## Testing Checklist

Before deploying to production:

- [ ] Thumbnail generation working for images
- [ ] Thumbnail generation working for videos
- [ ] Feed displays thumbnails, not full images
- [ ] Video autoplay disabled in feed
- [ ] Full image/video loads only on tap
- [ ] Pagination working (20 items initial)
- [ ] Infinite scroll loading correctly
- [ ] Cache working for thumbnails
- [ ] No aggressive prefetching

## Emergency Bandwidth Throttling

If bandwidth limit is reached:

### Option 1: Temporary Image Optimization

```typescript
// Force lower quality for all images
const EMERGENCY_MODE = true;

const imageUrl = EMERGENCY_MODE
  ? `${PINATA_GATEWAY}/${thumbnail_cid}` // Always use thumbnail
  : `${PINATA_GATEWAY}/${ipfs_cid}`;
```

### Option 2: Rate Limiting

```sql
-- Limit gateway requests per user
CREATE TABLE gateway_requests (
  user_id uuid,
  request_count integer DEFAULT 0,
  last_reset timestamptz DEFAULT now()
);

-- Reset daily
-- Max 100 requests/user/day in emergency mode
```

### Option 3: Upgrade Pinata Plan

If growth is sustained, upgrade to higher tier:
- Starter: 500 GB/month
- Growth: 1 TB/month
- Business: Custom

## Summary

**Critical Actions**:
1. ✅ Implement thumbnail system (95% bandwidth savings)
2. ✅ Disable video autoplay (massive savings)
3. ✅ Add pagination (prevents loading all at once)
4. ✅ Monitor Pinata bandwidth usage daily

**Without these optimizations, bandwidth will be the bottleneck, not storage.**

**Target**: Stay under 400 GB/month (80% of limit) to avoid overages.
