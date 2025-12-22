# Beta Testing Checklist - Invite-Only Launch

Quick reference for testing core upload functionality before beta launch.

---

## Pre-Launch Setup

### Database
- [ ] All migrations applied
- [ ] Test user created with 10 GB credits
- [ ] RLS policies active
- [ ] Edge functions deployed

### Cron Job
- [ ] Cleanup job scheduled (hourly)
- [ ] Test manual execution works
- [ ] Verify logs show in Supabase

### Environment
- [ ] Pinata JWT configured
- [ ] Supabase keys configured
- [ ] IPFS gateway accessible

---

## Frontend Integration Tests

### 1. Happy Path - Image Upload

**Steps**:
1. Select image from gallery (< 10 MB)
2. Add caption
3. Press upload button
4. Wait for completion
5. View in feed

**Expected**:
- Progress indicator shows
- Upload completes < 10s
- Image appears in feed
- Credits deducted correctly
- No errors

**SQL Check**:
```sql
-- Verify upload record
SELECT * FROM uploads WHERE user_id = '<test_user_id>' ORDER BY created_at DESC LIMIT 1;
-- Should show: status = 'complete'

-- Verify media share
SELECT * FROM media_shares WHERE user_id = '<test_user_id>' ORDER BY created_at DESC LIMIT 1;
-- Should show: ipfs_cid populated

-- Verify credits
SELECT * FROM storage_account WHERE user_id = '<test_user_id>';
-- credits_spent should increase by file_size_kb
-- credits_reserved should = 0
```

### 2. Happy Path - Video Upload

**Steps**:
1. Select video from gallery (< 50 MB)
2. Add caption
3. Press upload button
4. Wait for completion
5. View in feed

**Expected**:
- Progress indicator shows
- Upload completes < 30s
- Video appears in feed
- Video plays on tap
- Credits deducted correctly

### 3. Error Handling - File Too Large

**Steps**:
1. Select 100 MB file
2. Press upload

**Expected**:
- Error shown immediately
- Message: "File too large"
- No credits charged
- No upload record created

### 4. Error Handling - Storage Limit Reached

**Steps**:
1. Manually set user credits_balance = 100 KB
2. Try to upload 1 MB file

**Expected**:
- Error shown before upload starts
- Message: "Storage limit reached"
- No upload started
- No credits charged

**SQL Setup**:
```sql
-- Reduce balance to test
UPDATE storage_account
SET credits_balance = 100
WHERE user_id = '<test_user_id>';
```

### 5. Error Handling - Rate Limit Exceeded

**Steps**:
1. Upload 101 files in rapid succession (< 1 hour)

**Expected**:
- First 100 uploads succeed
- 101st upload fails with rate limit error
- Message: "Too many uploads. Please wait."
- After 1 hour, uploads work again

**SQL Check**:
```sql
-- Verify rate limit hit
SELECT * FROM rate_limits
WHERE user_id = '<test_user_id>' AND endpoint = 'begin-upload';
-- request_count should = 100
```

### 6. Error Handling - Network Failure

**Steps**:
1. Start upload
2. Turn off WiFi mid-upload
3. Turn WiFi back on

**Expected**:
- App handles error gracefully
- User can retry upload
- No duplicate charges
- Credits not stuck in reserved state

### 7. Concurrent Uploads

**Steps**:
1. Select 3 files
2. Upload all 3 simultaneously

**Expected**:
- All 3 uploads succeed
- Credits reserved during upload
- Credits charged on completion
- No race conditions
- Final balance correct

**SQL Check**:
```sql
-- During upload (reserved should be > 0)
SELECT * FROM storage_account WHERE user_id = '<test_user_id>';

-- After completion (reserved should = 0)
SELECT * FROM storage_account WHERE user_id = '<test_user_id>';
```

### 8. Failed Upload Cleanup

**Steps**:
1. Start upload
2. Force quit app mid-upload
3. Wait 2+ hours
4. Check if cleanup job ran

**Expected**:
- Upload marked as failed
- Credits released from reserved
- User can upload again
- Ledger shows failed upload

**SQL Check**:
```sql
-- Check upload status (should be 'failed' after cleanup)
SELECT * FROM uploads WHERE status = 'failed' AND user_id = '<test_user_id>';

-- Check credits released
SELECT * FROM storage_account WHERE user_id = '<test_user_id>';
-- credits_reserved should = 0
```

---

## Backend Tests (SQL)

### 1. Upload Flow Integrity

```sql
-- Test user
DO $$
DECLARE
  v_user_id uuid := '<test_user_id>';
  v_upload_id uuid;
  v_file_size bigint := 1024 * 100; -- 100 KB
BEGIN
  -- Begin upload
  INSERT INTO uploads (user_id, file_size_bytes, credits_required, status)
  VALUES (v_user_id, v_file_size, v_file_size, 'pending')
  RETURNING id INTO v_upload_id;

  -- Reserve credits
  PERFORM reserve_credits_for_upload(v_user_id, v_upload_id, v_file_size);

  -- Check reservation
  ASSERT (SELECT credits_reserved FROM storage_account WHERE user_id = v_user_id) = v_file_size,
    'Credits not reserved';

  -- Finalize upload
  PERFORM finalize_upload_transaction(v_user_id, v_upload_id, v_file_size, 'QmTest123', null);

  -- Check completion
  ASSERT (SELECT credits_reserved FROM storage_account WHERE user_id = v_user_id) = 0,
    'Credits not released';
  ASSERT (SELECT credits_spent FROM storage_account WHERE user_id = v_user_id) >= v_file_size,
    'Credits not charged';

  RAISE NOTICE 'Upload flow test PASSED';
END $$;
```

### 2. Concurrency Test

```sql
-- Simulate concurrent uploads
DO $$
DECLARE
  v_user_id uuid := '<test_user_id>';
  v_upload_id_1 uuid;
  v_upload_id_2 uuid;
  v_file_size bigint := 1024 * 50; -- 50 KB each
  v_initial_balance bigint;
  v_final_balance bigint;
BEGIN
  -- Get initial balance
  SELECT credits_balance INTO v_initial_balance
  FROM storage_account WHERE user_id = v_user_id;

  -- Upload 1
  INSERT INTO uploads (user_id, file_size_bytes, credits_required, status)
  VALUES (v_user_id, v_file_size, v_file_size, 'pending')
  RETURNING id INTO v_upload_id_1;

  PERFORM reserve_credits_for_upload(v_user_id, v_upload_id_1, v_file_size);

  -- Upload 2 (concurrent)
  INSERT INTO uploads (user_id, file_size_bytes, credits_required, status)
  VALUES (v_user_id, v_file_size, v_file_size, 'pending')
  RETURNING id INTO v_upload_id_2;

  PERFORM reserve_credits_for_upload(v_user_id, v_upload_id_2, v_file_size);

  -- Check both reserved
  ASSERT (SELECT credits_reserved FROM storage_account WHERE user_id = v_user_id) = v_file_size * 2,
    'Concurrent reservation failed';

  -- Finalize both
  PERFORM finalize_upload_transaction(v_user_id, v_upload_id_1, v_file_size, 'QmTest1', null);
  PERFORM finalize_upload_transaction(v_user_id, v_upload_id_2, v_file_size, 'QmTest2', null);

  -- Check final state
  SELECT credits_balance INTO v_final_balance
  FROM storage_account WHERE user_id = v_user_id;

  ASSERT (SELECT credits_reserved FROM storage_account WHERE user_id = v_user_id) = 0,
    'Credits still reserved';
  ASSERT v_final_balance = v_initial_balance - (v_file_size * 2),
    'Balance incorrect';

  RAISE NOTICE 'Concurrency test PASSED';
END $$;
```

### 3. Ledger Audit

```sql
-- Verify ledger consistency
SELECT
  sa.user_id,
  sa.credits_balance,
  sa.credits_spent,
  sa.credits_total,
  sa.credits_reserved,
  -- Recalculate from ledger
  COALESCE(SUM(sl.credits_amount) FILTER (WHERE sl.ledger_type = 'purchase'), 0) AS ledger_purchased,
  COALESCE(SUM(sl.credits_amount) FILTER (WHERE sl.ledger_type = 'charge_upload'), 0) AS ledger_spent
FROM storage_account sa
LEFT JOIN storage_ledger sl ON sl.user_id = sa.user_id
WHERE sa.user_id = '<test_user_id>'
GROUP BY sa.user_id, sa.credits_balance, sa.credits_spent, sa.credits_total, sa.credits_reserved;

-- Should match:
-- credits_total = ledger_purchased
-- credits_spent = ledger_spent (approximately, may differ by reserved amount)
```

### 4. Rate Limit Test

```sql
-- Test rate limit function
DO $$
DECLARE
  v_user_id uuid := '<test_user_id>';
  v_result json;
  i int;
BEGIN
  -- Clear existing rate limits
  DELETE FROM rate_limits WHERE user_id = v_user_id;

  -- Make 100 requests
  FOR i IN 1..100 LOOP
    v_result := check_rate_limit(v_user_id, 'begin-upload');
    ASSERT (v_result->>'allowed')::boolean = true,
      FORMAT('Request %s blocked incorrectly', i);
  END LOOP;

  -- 101st should fail
  v_result := check_rate_limit(v_user_id, 'begin-upload');
  ASSERT (v_result->>'allowed')::boolean = false,
    '101st request should be blocked';
  ASSERT v_result->>'reason' = 'RATE_LIMIT_EXCEEDED',
    'Wrong error code';

  RAISE NOTICE 'Rate limit test PASSED';
END $$;
```

---

## Manual Testing Scenarios

### Scenario 1: First-Time User Flow

**Goal**: Verify complete new user experience

1. Create new test account
2. Check default storage allocation (10 GB)
3. Upload first photo
4. View in feed
5. Delete photo (soft delete)
6. Upload video
7. Share to friend

**Expected Credits**:
- Initial: 10,485,760 KB (10 GB)
- After 2 MB photo: 10,483,712 KB
- After 20 MB video: 10,463,232 KB

### Scenario 2: Power User

**Goal**: Test heavy usage patterns

1. Upload 50 photos (1 MB each)
2. Upload 10 videos (10 MB each)
3. Check rate limiting
4. Check storage summary
5. Monitor Pinata bandwidth

**Expected**:
- Total uploads: 60
- Total size: ~150 MB
- Rate limit should NOT trigger (< 100 uploads/hour)
- Credits spent: ~153,600 KB

### Scenario 3: Error Recovery

**Goal**: Verify system handles failures gracefully

1. Start upload, kill app
2. Wait for cleanup (> 2 hours)
3. Verify credits released
4. Retry same upload
5. Verify success

**Expected**:
- First upload: Failed (cleanup job)
- Credits: Released
- Second upload: Success
- No duplicate charges

---

## Performance Benchmarks

### Upload Performance

| File Size | Expected Time | Network |
|-----------|---------------|---------|
| 1 MB      | < 5s          | WiFi    |
| 5 MB      | < 10s         | WiFi    |
| 10 MB     | < 15s         | WiFi    |
| 50 MB     | < 60s         | WiFi    |

### API Response Times

| Endpoint          | Expected Time |
|-------------------|---------------|
| check-upload-quota| < 100ms       |
| begin-upload      | < 150ms       |
| finalize-upload   | < 200ms       |
| fail-upload       | < 100ms       |
| get-storage-summary| < 100ms      |

### Database Queries

| Query                | Expected Time |
|---------------------|---------------|
| Storage account read| < 50ms        |
| Feed query (20)     | < 150ms       |
| Upload insert       | < 100ms       |
| Ledger insert       | < 50ms        |

---

## Monitoring Checklist

### Daily Checks

- [ ] Check upload success rate (> 95%)
- [ ] Check for stuck uploads (should be 0)
- [ ] Review error logs
- [ ] Check Pinata bandwidth usage

### Weekly Checks

- [ ] Review all storage accounts
- [ ] Check ledger consistency
- [ ] Review rate limit hits
- [ ] Check for abuse patterns

### SQL Monitoring Queries

```sql
-- Daily success rate
SELECT
  DATE(created_at) AS day,
  COUNT(*) FILTER (WHERE status = 'complete') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'complete')::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS success_rate
FROM uploads
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- Check stuck uploads
SELECT COUNT(*) AS stuck_uploads
FROM uploads
WHERE status = 'pending'
  AND created_at < now() - INTERVAL '2 hours';

-- Storage usage
SELECT
  COUNT(*) AS total_users,
  SUM(credits_spent) / 1048576.0 AS total_gb_used,
  AVG(credits_balance) / 1048576.0 AS avg_balance_gb
FROM storage_account;

-- Top users by storage
SELECT
  u.username,
  sa.credits_spent / 1048576.0 AS gb_used,
  sa.credits_balance / 1048576.0 AS gb_remaining
FROM storage_account sa
JOIN users u ON u.id = sa.user_id
ORDER BY sa.credits_spent DESC
LIMIT 10;
```

---

## Known Issues (Expected in Beta)

### 1. No Thumbnails
- Feed loads full resolution images
- Can be slow on mobile data
- Bandwidth intensive

**Workaround**: WiFi recommended for browsing feed

### 2. Manual Monitoring
- No automated dashboard
- SQL queries required
- Manual intervention if issues

**Workaround**: Check daily SQL queries

### 3. Basic Rate Limiting
- Only begin-upload protected
- No feed rate limiting
- No account freeze automation

**Workaround**: Monitor manually, freeze accounts via SQL if needed

---

## Emergency Procedures

### Rollback Upload

```sql
-- If upload charged incorrectly
BEGIN;

-- Mark upload as failed
UPDATE uploads SET status = 'failed' WHERE id = '<upload_id>';

-- Refund credits
UPDATE storage_account
SET
  credits_balance = credits_balance + <amount>,
  credits_spent = credits_spent - <amount>
WHERE user_id = '<user_id>';

-- Add ledger entry
INSERT INTO storage_ledger (user_id, ledger_type, credits_amount, metadata)
VALUES ('<user_id>', 'purchase', <amount>, '{"reason": "Refund for failed upload"}'::jsonb);

COMMIT;
```

### Reset User Rate Limit

```sql
-- If false positive
DELETE FROM rate_limits WHERE user_id = '<user_id>';
```

### Add Credits Manually

```sql
-- Beta bonus credits
SELECT add_storage_credits(
  '<user_id>',
  10485760, -- 10 GB
  'manual',
  'beta_bonus_' || gen_random_uuid()::text,
  NULL, NULL,
  '{"reason": "Beta tester bonus"}'::jsonb
);
```

---

## Sign-Off Checklist

Before launching beta:

### Backend
- [ ] All migrations applied
- [ ] All edge functions deployed
- [ ] Cleanup job scheduled and tested
- [ ] Service role keys secured
- [ ] RLS policies verified

### Frontend
- [ ] Upload flow working
- [ ] Error handling implemented
- [ ] Rate limit errors handled
- [ ] Storage limit errors handled
- [ ] Feed displays uploads

### Testing
- [ ] Happy path tested (image + video)
- [ ] Error scenarios tested
- [ ] Rate limiting tested
- [ ] Concurrent uploads tested
- [ ] Cleanup job tested

### Operations
- [ ] Monitoring queries ready
- [ ] Daily check process defined
- [ ] Emergency procedures documented
- [ ] Support email configured

### Documentation
- [ ] Beta scope documented
- [ ] Known issues listed
- [ ] User invite template ready
- [ ] Support FAQ prepared

---

## Success Criteria

Beta launch is successful if:
- ✅ > 95% upload success rate
- ✅ Zero data loss
- ✅ No incorrect charges
- ✅ Rate limiting works
- ✅ Cleanup job runs automatically
- ✅ Users can upload and view content

Beta launch should ROLLBACK if:
- ❌ < 80% upload success rate
- ❌ Data loss occurs
- ❌ Duplicate charges
- ❌ System stability issues

---

**Ready to launch!** 🚀
