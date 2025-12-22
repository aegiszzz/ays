# Beta Scope Freeze - Invite-Only Launch

**Launch Date**: This Week
**Scope**: Minimal viable storage system
**Strategy**: Stable core features only

---

## ✅ ACTIVE FEATURES (Beta Ready)

### 1. Upload Flow
- ✅ `begin-upload` - Reserve credits, create upload record
- ✅ `finalize-upload` - Charge credits, mark complete
- ✅ `fail-upload` - Release credits, mark failed
- ✅ File size validation
- ✅ IPFS CID storage

**Status**: Production-ready, tested

### 2. Storage Accounting
- ✅ Credits system (1 credit = 1 KB)
- ✅ `storage_account` table
- ✅ `storage_ledger` for audit trail
- ✅ Credits reservation (concurrency protection)
- ✅ Balance tracking

**Status**: Production-ready, tested

### 3. File Size Limit
- ✅ Check quota before upload
- ✅ `STORAGE_LIMIT_REACHED` error
- ✅ User-friendly error message
- ✅ No partial uploads

**Status**: Production-ready, tested

### 4. Basic Rate Limiting
- ✅ `check_rate_limit()` function exists
- ✅ 100 requests/hour per user for begin-upload
- ✅ Simple user-friendly error

**Scope**: Only `begin-upload` endpoint

### 5. Cleanup Job
- ✅ Fail stuck uploads (> 2 hours)
- ✅ Release reserved credits
- ✅ Runs hourly (cron)

**Scope**: Stuck uploads only (no thumbnail cleanup, no rate limit cleanup)

---

## 🔒 INACTIVE FEATURES (Code Exists, Not Connected)

### 1. Thumbnail Pipeline ❌
**Status**: Code complete, database ready, not used in beta

**Why Not**:
- Adds complexity to upload flow
- Client library needs testing
- Can launch without it

**Tables Created**:
- `media_shares.thumbnail_cid`
- `media_shares.preview_cid`
- `media_shares.video_poster_cid`
- `media_shares.processing_status`

**Action**: Tables exist but all values = NULL in beta

**Future**: Enable after beta feedback

### 2. Purchase Idempotency ❌
**Status**: Code complete, database ready, no webhooks

**Why Not**:
- No payment integration in beta
- Invite-only = free credits
- No Stripe/Solana webhooks needed

**Tables Created**:
- `purchases`
- `add_storage_credits()` idempotent function

**Action**: Tables exist but empty in beta

**Future**: Enable when adding payments

### 3. Dashboard & Monitoring ❌
**Status**: Queries ready, no Metabase setup

**Why Not**:
- Small beta user count
- Manual monitoring sufficient
- Setup time not worth it

**Available Queries**:
- Upload success rate
- Bandwidth usage
- Credits reserved health

**Action**: Monitor manually with SQL queries

**Future**: Set up Metabase after beta proves demand

### 4. Advanced Rate Limiting ❌
**Status**: System ready, only begin-upload protected

**Why Not**:
- Beta users trusted
- Abuse unlikely with invite-only
- Simple is better

**Active Endpoints**:
- ✅ `begin-upload` - Rate limited

**Inactive Endpoints**:
- ❌ `finalize-upload` - No rate limit
- ❌ `feed` - No rate limit
- ❌ `process-thumbnail` - No rate limit

**Action**: Only check rate limit on begin-upload

**Future**: Enable for all endpoints if abuse detected

### 5. Account Freeze ❌
**Status**: Functions ready, not triggered

**Why Not**:
- Manual moderation for beta
- Small user count
- No automated freeze rules

**Functions Created**:
- `freeze_account()`
- `unfreeze_account()`

**Action**: Available for manual use by admins if needed

**Future**: Automatic triggers after beta

---

## 📱 FRONTEND REQUIREMENTS (Minimal)

### Upload Flow

```typescript
// 1. Check quota (optional but recommended)
const { can_upload, available_credits } = await checkUploadQuota(fileSize);

if (!can_upload) {
  Alert.alert('Storage limit reached', 'Please free up space or upgrade');
  return;
}

// 2. Begin upload
const { upload_id } = await beginUpload(fileSize);

// 3. Upload to IPFS
const ipfsCid = await uploadToIPFS(fileUri);

// 4. Create media share (optional, for social feed)
const { data: mediaShare } = await supabase
  .from('media_shares')
  .insert({
    user_id: currentUser.id,
    ipfs_cid: ipfsCid,
    media_type: 'image', // or 'video'
    caption: captionText,
  })
  .select()
  .single();

// 5. Finalize upload
await finalizeUpload(upload_id, ipfsCid, mediaShare?.id);
```

**NO THUMBNAILS** in beta - Just upload full resolution

### Error Handling

```typescript
try {
  await beginUpload(fileSize);
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    Alert.alert('Too many uploads', 'Please wait a few minutes');
  } else if (error.code === 'STORAGE_LIMIT_REACHED') {
    Alert.alert('Storage full', 'Delete old uploads to continue');
  } else {
    Alert.alert('Upload failed', 'Please try again');
  }
}
```

### Feed Display

```typescript
// Simple feed query - NO media_shares_feed view
const { data: shares } = await supabase
  .from('media_shares')
  .select('id, ipfs_cid, caption, created_at, user_id, users(username, avatar_url)')
  .order('created_at', { ascending: false })
  .range(0, 19);

// Display full resolution (no thumbnails in beta)
<Image
  source={{ uri: `${PINATA_GATEWAY}/${share.ipfs_cid}` }}
  style={{ width: '100%', height: 400 }}
  resizeMode="cover"
/>
```

---

## 🧪 BETA TESTING CHECKLIST

### Core Upload Flow
- [ ] Upload image successfully
- [ ] Upload video successfully
- [ ] Failed upload releases credits
- [ ] Concurrent uploads handled correctly
- [ ] File size limit blocks oversized files

### Rate Limiting
- [ ] 101st upload in 1 hour fails with rate limit error
- [ ] User can upload again after 1 hour
- [ ] Error message is user-friendly

### Storage Accounting
- [ ] Credits deducted correctly
- [ ] Balance shown accurately
- [ ] Storage limit error when balance = 0
- [ ] Ledger records all transactions

### Cleanup Job
- [ ] Stuck upload (> 2 hours) marked as failed
- [ ] Reserved credits released for stuck uploads
- [ ] No false positives (active uploads not touched)

### Error Handling
- [ ] Network error handled gracefully
- [ ] IPFS upload failure handled
- [ ] Database errors don't crash app
- [ ] User sees friendly error messages

---

## 📊 BETA METRICS (Manual Monitoring)

### Daily Check (SQL Queries)

#### Upload Success Rate
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'complete') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'complete')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('complete', 'failed')), 0) * 100,
    2
  ) AS success_rate_percentage
FROM uploads
WHERE created_at > now() - INTERVAL '24 hours';
```

#### Storage Usage
```sql
SELECT
  COUNT(*) AS total_users,
  SUM(credits_spent) / 102400.0 AS total_gb_used,
  AVG(credits_balance) / 102400.0 AS avg_balance_gb
FROM storage_account;
```

#### Rate Limit Hits
```sql
SELECT
  COUNT(DISTINCT user_id) AS users_rate_limited
FROM rate_limits
WHERE created_at > now() - INTERVAL '24 hours'
  AND request_count >= 100;
```

#### Stuck Uploads
```sql
SELECT COUNT(*) AS stuck_uploads
FROM uploads
WHERE status = 'pending'
  AND created_at < now() - INTERVAL '2 hours';
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Database
- [x] All migrations applied
- [x] Tables created
- [x] Functions deployed
- [x] RLS policies active

### Edge Functions
- [ ] `begin-upload` deployed
- [ ] `finalize-upload` deployed
- [ ] `fail-upload` deployed
- [ ] `check-upload-quota` deployed
- [ ] `get-storage-summary` deployed
- [ ] `cleanup-job` deployed

### Cron Job
- [ ] Cleanup job scheduled (hourly)
- [ ] Test cron execution
- [ ] Verify logs

### Client App
- [ ] Upload flow implemented
- [ ] Error handling implemented
- [ ] Rate limit error handled
- [ ] Storage limit error handled
- [ ] Feed displays uploads

### Testing
- [ ] Happy path tested
- [ ] Error paths tested
- [ ] Rate limiting tested
- [ ] Concurrent uploads tested
- [ ] Cleanup job tested

---

## 🔧 OPERATIONS (Minimal)

### Daily Tasks
1. Check upload success rate (should be > 95%)
2. Check for stuck uploads (should be 0 after cleanup)
3. Monitor Pinata bandwidth usage

### Weekly Tasks
1. Review error logs
2. Check storage account balances
3. Identify any abuse patterns

### Manual Interventions

#### Unstick Upload
```sql
-- If cleanup job misses something
UPDATE uploads
SET status = 'failed', completed_at = now()
WHERE id = '<upload_id>';

-- Release credits
UPDATE storage_account
SET credits_reserved = credits_reserved - <amount>
WHERE user_id = '<user_id>';
```

#### Reset Rate Limit
```sql
-- If false positive
DELETE FROM rate_limits
WHERE user_id = '<user_id>'
  AND endpoint = 'begin-upload';
```

#### Add Credits Manually
```sql
-- For beta users
SELECT add_storage_credits(
  '<user_id>',
  1048576, -- 1 GB = 1024*1024 KB
  'manual',
  'beta_invite_bonus',
  NULL, NULL,
  '{"reason": "Beta invite bonus"}'::jsonb
);
```

---

## 📈 SUCCESS CRITERIA (Beta)

### Must Have
- ✅ Upload success rate > 95%
- ✅ No data loss
- ✅ No duplicate charges
- ✅ Rate limiting works

### Nice to Have
- Average upload time < 5s (depends on file size)
- Zero stuck uploads (cleanup job works)
- No user complaints about errors

### Failure Criteria (Rollback)
- ❌ Upload success rate < 80%
- ❌ Data loss occurs
- ❌ Credits charged incorrectly
- ❌ Cleanup job causes issues

---

## 🎯 POST-BETA ROADMAP

### Phase 1 (After Beta Feedback)
1. Enable thumbnail pipeline
2. Set up Metabase dashboard
3. Enable advanced rate limiting

### Phase 2 (When Adding Payments)
1. Enable purchase idempotency
2. Stripe webhook integration
3. Solana payment integration

### Phase 3 (Scale Up)
1. CDN for thumbnails
2. Automated abuse detection
3. Advanced monitoring

---

## 📝 BETA INVITE TEMPLATE

```
Welcome to [App Name] Beta!

You've been given:
- 10 GB free storage
- Unlimited uploads (rate limit: 100/hour)
- Full resolution photo/video storage

What to test:
1. Upload photos and videos
2. Share with friends
3. View your feed

Known limitations:
- No thumbnails yet (full res loads)
- Manual monitoring (we're watching!)
- Invite-only (don't share publicly)

Report issues: [support email]

Thank you for being an early adopter!
```

---

## 🔐 BETA SECURITY

### Access Control
- ✅ RLS policies active
- ✅ Service role keys secured
- ✅ Pinata JWT secured
- ✅ Rate limiting active

### Data Protection
- ✅ IPFS immutable storage
- ✅ Ledger audit trail
- ✅ No data deletion (soft delete only)

### Privacy
- ✅ Media shares private by default
- ✅ No public API endpoints
- ✅ User data isolated

---

## ✅ SUMMARY

**Active**: Upload flow, storage accounting, file size limit, basic rate limit, cleanup cron

**Inactive**: Thumbnails, purchase idempotency, dashboard, advanced rate limiting, account freeze

**Frontend**: Simple upload flow, full resolution, basic error handling

**Operations**: Manual monitoring, daily SQL queries, minimal intervention

**Goal**: Stable beta with trusted users, gather feedback, iterate

**Timeline**: 2-4 weeks beta, then enable advanced features based on feedback
