# Beta Deployment Guide - Quick Start

Fast deployment guide for invite-only beta launch.

---

## Pre-Deployment Checklist

- [ ] Database migrations applied
- [ ] Edge functions code ready
- [ ] Pinata account configured
- [ ] Supabase project ready
- [ ] Environment variables set

---

## Step 1: Verify Database (5 min)

### Check Migrations

```bash
# List applied migrations
supabase migration list

# Should see all these migrations:
# - create_storage_accounting_system
# - create_finalize_upload_transaction
# - add_storage_credits_function
# - add_credits_reserved_for_concurrency
# - update_begin_upload_with_reservation
# - update_finalize_with_reservation_release
# - create_release_credits_for_failed_upload
# - add_idempotency_ledger_and_security_features
# - update_finalize_transaction_with_ledger
# - update_add_storage_with_ledger
# - create_rate_limiting_system
# - create_purchase_idempotency_system
# (others for thumbnails - not used in beta)
```

### Test Database Functions

```sql
-- Test storage account creation
SELECT add_storage_credits(
  auth.uid(),
  10485760, -- 10 GB
  'manual',
  'beta_test',
  NULL, NULL,
  '{"reason": "Test"}'::jsonb
);

-- Verify
SELECT * FROM storage_account WHERE user_id = auth.uid();

-- Test rate limit
SELECT check_rate_limit(auth.uid(), 'begin-upload');
```

---

## Step 2: Deploy Edge Functions (10 min)

### Deploy Core Upload Functions

```bash
# Deploy begin-upload
supabase functions deploy begin-upload

# Deploy finalize-upload
supabase functions deploy finalize-upload

# Deploy fail-upload
supabase functions deploy fail-upload

# Deploy check-upload-quota
supabase functions deploy check-upload-quota

# Deploy get-storage-summary
supabase functions deploy get-storage-summary

# Deploy cleanup-job
supabase functions deploy cleanup-job
```

### Test Edge Functions

```bash
# Get your access token
export TOKEN="<your-supabase-anon-key>"
export PROJECT_URL="https://<project-ref>.supabase.co"

# Test check-upload-quota
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file_size_bytes": 1048576}' \
  "$PROJECT_URL/functions/v1/check-upload-quota"

# Should return: {"can_upload": true, ...}

# Test get-storage-summary
curl -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$PROJECT_URL/functions/v1/get-storage-summary"

# Should return: {"total_gb": 10, "used_gb": 0, ...}
```

---

## Step 3: Schedule Cleanup Job (5 min)

### Option A: Supabase Cron (Recommended)

```sql
-- Install pg_cron extension if not already installed
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup job (every hour at :00)
SELECT cron.schedule(
  'storage-cleanup-beta',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/cleanup-job',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verify scheduled
SELECT * FROM cron.job WHERE jobname = 'storage-cleanup-beta';
```

### Option B: External Cron

Set up external cron job (GitHub Actions, etc) to call:

```bash
curl -X POST \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  https://<project-ref>.supabase.co/functions/v1/cleanup-job
```

### Test Cleanup Job

```bash
# Manual test
export SERVICE_KEY="<your-service-role-key>"

curl -X POST \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  "$PROJECT_URL/functions/v1/cleanup-job"

# Should return: {"success": true, "results": {...}}
```

---

## Step 4: Create Beta Test Users (5 min)

### Option A: Self Sign-Up

If email confirmation disabled:

```typescript
// Client app signup
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'test123',
});
```

### Option B: Manual Creation

```sql
-- Create test user (as admin)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'test@example.com',
  crypt('test123', gen_salt('bf')),
  now(),
  now(),
  now()
)
RETURNING id;

-- Add 10 GB credits
SELECT add_storage_credits(
  '<user_id_from_above>',
  10485760,
  'manual',
  'beta_invite',
  NULL, NULL,
  '{"reason": "Beta invite"}'::jsonb
);
```

---

## Step 5: Frontend Integration (15 min)

### Install Dependencies

```bash
npm install @supabase/supabase-js
```

### Configure Supabase Client

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);
```

### Implement Upload Flow

```typescript
// Example upload function
async function uploadMedia(fileUri: string, fileSize: number) {
  try {
    // 1. Check quota
    const quotaResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/check-upload-quota`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_size_bytes: fileSize }),
      }
    );
    const quota = await quotaResponse.json();

    if (!quota.can_upload) {
      throw new Error('Storage limit reached');
    }

    // 2. Begin upload
    const beginResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/begin-upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_size_bytes: fileSize }),
      }
    );
    const { upload_id } = await beginResponse.json();

    // 3. Upload to IPFS (implement based on your IPFS solution)
    const ipfsCid = await uploadToIPFS(fileUri);

    // 4. Finalize
    const finalizeResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/finalize-upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          upload_id,
          ipfs_cid: ipfsCid,
        }),
      }
    );

    return await finalizeResponse.json();
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}
```

---

## Step 6: Smoke Test (10 min)

### Test 1: Simple Upload

```typescript
// Test with small file
const result = await uploadMedia('path/to/test.jpg', 1024 * 100); // 100 KB
console.log('Upload success:', result);
```

### Test 2: Storage Limit

```sql
-- Reduce balance to test limit
UPDATE storage_account
SET credits_balance = 50
WHERE user_id = '<test_user_id>';
```

```typescript
// Try to upload 100 KB file (should fail)
const result = await uploadMedia('path/to/test.jpg', 1024 * 100);
// Should throw: "Storage limit reached"
```

### Test 3: Rate Limit

```typescript
// Upload 101 files rapidly
for (let i = 0; i < 101; i++) {
  await uploadMedia('path/to/test.jpg', 1024);
}
// 101st should fail with rate limit error
```

---

## Step 7: Monitoring Setup (5 min)

### Create Monitoring Queries

Save these queries for daily monitoring:

```sql
-- Query 1: Upload success rate (last 24h)
SELECT
  COUNT(*) FILTER (WHERE status = 'complete') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'complete')::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS success_rate
FROM uploads
WHERE created_at > now() - INTERVAL '24 hours';

-- Query 2: Stuck uploads
SELECT COUNT(*) FROM uploads
WHERE status = 'pending' AND created_at < now() - INTERVAL '2 hours';

-- Query 3: Storage usage
SELECT
  COUNT(*) AS users,
  SUM(credits_spent) / 1048576.0 AS total_gb_used
FROM storage_account;
```

### Set Up Alerts (Optional)

Create simple monitoring script:

```bash
#!/bin/bash
# monitor.sh - Run daily

SUCCESS_RATE=$(psql -t -c "
  SELECT ROUND(
    COUNT(*) FILTER (WHERE status = 'complete')::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  )
  FROM uploads
  WHERE created_at > now() - INTERVAL '24 hours'
")

if (( $(echo "$SUCCESS_RATE < 90" | bc -l) )); then
  echo "ALERT: Upload success rate is $SUCCESS_RATE%"
  # Send email/slack notification
fi
```

---

## Step 8: Invite Beta Users (5 min)

### Send Invite Email

```
Subject: You're invited to [App Name] Beta!

Hi [Name],

You've been selected for our private beta!

Your beta account includes:
- 10 GB free storage
- Unlimited uploads (100/hour rate limit)
- Early access to new features

Getting started:
1. Download the app: [Link]
2. Sign up with this email
3. Start uploading!

Known beta limitations:
- Feed loads full resolution (no thumbnails yet)
- Small user group (invite-only)

Report issues: beta@yourapp.com

Thanks for being an early adopter!

[Team]
```

### Grant Credits

```sql
-- After user signs up
SELECT add_storage_credits(
  (SELECT id FROM auth.users WHERE email = 'beta-user@example.com'),
  10485760, -- 10 GB
  'manual',
  'beta_invite_' || gen_random_uuid()::text,
  NULL, NULL,
  '{"reason": "Beta invite bonus"}'::jsonb
);
```

---

## Post-Deployment Checklist

### Day 1
- [ ] Monitor upload success rate
- [ ] Check for errors in logs
- [ ] Verify cleanup job ran
- [ ] Check Pinata bandwidth

### Week 1
- [ ] Review all storage accounts
- [ ] Check ledger consistency
- [ ] Monitor rate limit hits
- [ ] Gather user feedback

### Week 2
- [ ] Analyze upload patterns
- [ ] Check for abuse
- [ ] Plan advanced features
- [ ] Prepare for scale

---

## Troubleshooting

### Upload Stuck

```sql
-- Find stuck upload
SELECT * FROM uploads
WHERE status = 'pending'
  AND created_at < now() - INTERVAL '2 hours';

-- Manually fail and release
UPDATE uploads SET status = 'failed', completed_at = now()
WHERE id = '<upload_id>';

UPDATE storage_account
SET credits_reserved = credits_reserved - <amount>
WHERE user_id = '<user_id>';
```

### Rate Limit False Positive

```sql
-- Reset rate limit
DELETE FROM rate_limits WHERE user_id = '<user_id>';
```

### Credits Incorrect

```sql
-- Check ledger
SELECT * FROM storage_ledger WHERE user_id = '<user_id>' ORDER BY created_at DESC;

-- Recalculate
SELECT
  COALESCE(SUM(credits_amount) FILTER (WHERE ledger_type = 'purchase'), 0) AS total_purchased,
  COALESCE(SUM(credits_amount) FILTER (WHERE ledger_type = 'charge_upload'), 0) AS total_spent
FROM storage_ledger
WHERE user_id = '<user_id>';
```

---

## Rollback Plan

If critical issues occur:

1. **Disable uploads immediately**:
   ```sql
   -- Set all users to zero balance temporarily
   UPDATE storage_account SET credits_balance = 0;
   ```

2. **Fix issue** (database, code, etc)

3. **Restore balances**:
   ```sql
   -- Recalculate from ledger
   UPDATE storage_account sa
   SET credits_balance = (
     SELECT COALESCE(SUM(credits_amount), 0)
     FROM storage_ledger
     WHERE user_id = sa.user_id
   );
   ```

4. **Re-enable uploads**

---

## Success Metrics

Beta is successful if:
- ✅ > 95% upload success rate
- ✅ < 5% stuck upload rate
- ✅ Zero data loss
- ✅ No incorrect charges
- ✅ Cleanup job runs reliably
- ✅ Positive user feedback

---

## Next Steps After Beta

1. Enable thumbnail pipeline
2. Set up Metabase dashboard
3. Add payment integration
4. Enable advanced rate limiting
5. Scale to public launch

---

**Deployment time**: ~1 hour
**Ready to go live!** 🚀
