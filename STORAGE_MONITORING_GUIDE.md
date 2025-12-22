# Storage System Monitoring & Observability Guide

## Overview

This guide provides SQL queries, metrics, and alerts for monitoring the storage accounting system in production.

## Critical Metrics

### 1. Credits Reserved Health

**Purpose**: Detect stuck reservations (uploads that never finalize/fail)

```sql
-- Find accounts with high reserved credits
SELECT
  sa.user_id,
  u.email,
  sa.credits_balance,
  sa.credits_reserved,
  sa.credits_reserved::float / NULLIF(sa.credits_balance, 0) * 100 AS reserved_percentage,
  sa.updated_at
FROM storage_account sa
JOIN auth.users u ON u.id = sa.user_id
WHERE sa.credits_reserved > 0
  AND sa.credits_reserved::float / NULLIF(sa.credits_balance, 0) > 0.5 -- More than 50% reserved
ORDER BY sa.credits_reserved DESC;

-- Find old pending uploads (stuck reservations)
SELECT
  u.id AS upload_id,
  u.user_id,
  au.email,
  u.credits_required,
  u.status,
  u.created_at,
  EXTRACT(EPOCH FROM (now() - u.created_at))/3600 AS hours_pending
FROM uploads u
JOIN auth.users au ON au.id = u.user_id
WHERE u.status = 'pending'
  AND u.created_at < now() - INTERVAL '1 hour' -- Pending for > 1 hour
ORDER BY u.created_at ASC;
```

**Alert Threshold**:
- Reserved > 50% for > 1 hour → Investigate
- Pending uploads > 1 hour → Likely abandoned

**Action**:
```sql
-- Release stuck reservation (emergency fix)
UPDATE storage_account
SET credits_reserved = GREATEST(0, credits_reserved - <amount>)
WHERE user_id = '<user_id>';

-- Mark upload as failed
UPDATE uploads
SET status = 'failed', completed_at = now()
WHERE id = '<upload_id>';
```

### 2. Ledger Consistency

**Purpose**: Ensure ledger matches account balances

```sql
-- Verify ledger totals match account balances
WITH ledger_totals AS (
  SELECT
    user_id,
    SUM(credits_amount) AS ledger_total
  FROM storage_ledger
  GROUP BY user_id
)
SELECT
  sa.user_id,
  u.email,
  sa.credits_total - sa.credits_spent AS calculated_balance,
  sa.credits_balance AS actual_balance,
  lt.ledger_total AS ledger_total,
  (sa.credits_balance - lt.ledger_total) AS discrepancy
FROM storage_account sa
JOIN auth.users u ON u.id = sa.user_id
LEFT JOIN ledger_totals lt ON lt.user_id = sa.user_id
WHERE ABS(sa.credits_balance - COALESCE(lt.ledger_total, 0)) > 10 -- Discrepancy > 10 credits
ORDER BY ABS(sa.credits_balance - COALESCE(lt.ledger_total, 0)) DESC;
```

**Alert Threshold**:
- Discrepancy > 100 credits → Critical
- Discrepancy > 10 credits → Warning

**Action**: Investigate ledger entries and fix accounting

### 3. Upload Success Rate

**Purpose**: Detect system issues or IPFS problems

```sql
-- Upload success rate (last 24 hours)
SELECT
  COUNT(*) FILTER (WHERE status = 'complete') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'complete')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('complete', 'failed')), 0) * 100,
    2
  ) AS success_rate_percentage
FROM uploads
WHERE created_at > now() - INTERVAL '24 hours';

-- Top failure reasons
SELECT
  l.metadata->>'error_message' AS error_message,
  COUNT(*) AS occurrences
FROM storage_ledger l
WHERE l.ledger_type = 'charge_upload'
  AND l.credits_amount = 0
  AND l.metadata->>'status' = 'failed'
  AND l.created_at > now() - INTERVAL '24 hours'
GROUP BY l.metadata->>'error_message'
ORDER BY occurrences DESC
LIMIT 10;
```

**Alert Threshold**:
- Success rate < 90% → Warning
- Success rate < 75% → Critical

**Action**: Check IPFS gateway health, network issues

### 4. Storage Utilization

**Purpose**: Predict capacity and identify heavy users

```sql
-- Overall storage utilization
SELECT
  SUM(credits_total) / 102400.0 AS total_allocated_gb,
  SUM(credits_spent) / 102400.0 AS total_used_gb,
  SUM(credits_balance) / 102400.0 AS total_remaining_gb,
  SUM(credits_reserved) / 102400.0 AS total_reserved_gb,
  ROUND(
    SUM(credits_spent)::numeric / NULLIF(SUM(credits_total), 0) * 100,
    2
  ) AS overall_utilization_percentage
FROM storage_account;

-- Users near quota (90%+)
SELECT
  sa.user_id,
  u.email,
  sa.credits_total / 102400.0 AS total_gb,
  sa.credits_spent / 102400.0 AS used_gb,
  sa.credits_balance / 102400.0 AS remaining_gb,
  ROUND(
    sa.credits_spent::numeric / NULLIF(sa.credits_total, 0) * 100,
    2
  ) AS utilization_percentage
FROM storage_account sa
JOIN auth.users u ON u.id = sa.user_id
WHERE sa.credits_total > 0
  AND sa.credits_spent::float / sa.credits_total > 0.9
ORDER BY utilization_percentage DESC;
```

**Alert Threshold**:
- User > 90% → Send upgrade prompt
- User > 95% → Urgent upgrade prompt

### 5. Concurrent Upload Pressure

**Purpose**: Monitor reservation system effectiveness

```sql
-- Current reservation pressure
SELECT
  COUNT(*) AS accounts_with_reservations,
  AVG(credits_reserved::float / NULLIF(credits_balance, 0) * 100) AS avg_reserved_percentage,
  MAX(credits_reserved::float / NULLIF(credits_balance, 0) * 100) AS max_reserved_percentage
FROM storage_account
WHERE credits_reserved > 0;

-- Active uploads per user
SELECT
  user_id,
  COUNT(*) AS pending_uploads,
  SUM(credits_required) / 102400.0 AS total_pending_gb
FROM uploads
WHERE status = 'pending'
GROUP BY user_id
HAVING COUNT(*) > 3 -- More than 3 concurrent uploads
ORDER BY pending_uploads DESC;
```

**Alert Threshold**:
- Avg reserved > 25% → High concurrent upload activity
- User with > 5 pending uploads → Possible issue

## Structured Logging

### Log Format

All edge functions should log in structured JSON format:

```typescript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  service: 'begin-upload',
  user_id: user.id,
  upload_id: upload.id,
  credits_required: required_credits,
  credits_available: availableCredits,
  idempotency_key: idempotency_key,
  status: 'success',
}));
```

### Log Levels

- **info**: Successful operations
- **warn**: Degraded performance, quota warnings
- **error**: Failed operations, system errors

### Critical Events to Log

1. **begin-upload**:
   - `user_id`, `credits_required`, `credits_available`, `idempotency_key`
   - `reservation_success` or `reservation_failed`

2. **finalize-upload**:
   - `user_id`, `upload_id`, `credits_charged`
   - `finalize_success` or `finalize_failed`
   - `idempotent_return` (if already completed)

3. **fail-upload**:
   - `user_id`, `upload_id`, `credits_released`, `error_message`

4. **Reservation Errors**:
   - `insufficient_credits`, `stuck_reservation`, `release_failed`

## Alerts & Notifications

### Critical Alerts (Immediate Action)

1. **Ledger Discrepancy > 1000 credits**
   - Check: Ledger consistency query
   - Action: Audit ledger entries, fix accounting

2. **Success Rate < 75%**
   - Check: Upload success rate query
   - Action: Check IPFS gateway, network issues

3. **Stuck Reservations > 24 hours**
   - Check: Old pending uploads query
   - Action: Release stuck reservations

### Warning Alerts (Monitor)

1. **Success Rate 75-90%**
   - Monitor: IPFS performance, error messages

2. **Reserved Credits > 50% for > 1 hour**
   - Monitor: User upload patterns

3. **User Utilization > 90%**
   - Action: Send upgrade prompts

## Dashboard Metrics

### Real-Time Metrics

1. **Active Uploads**: Count of pending uploads
2. **Credits Reserved**: Total credits currently reserved
3. **Upload Success Rate**: Last 1 hour, 24 hours, 7 days
4. **Average Upload Time**: Time from begin to finalize

### Daily Metrics

1. **Total Uploads**: Complete, failed, abandoned
2. **Total Bytes Uploaded**: Converted to GB
3. **Storage Utilization Growth**: Daily change in used GB
4. **Top Failure Reasons**: Most common error messages

### Weekly Metrics

1. **User Growth**: New accounts created
2. **Storage Purchases**: Add-storage transactions
3. **Quota Warnings**: Users hitting 90%+ utilization
4. **Stuck Upload Rate**: Percentage of uploads stuck > 1 hour

## Troubleshooting Playbook

### Issue: User reports "Upload failed after uploading"

**Diagnosis**:
```sql
-- Check upload record
SELECT * FROM uploads WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 5;

-- Check ledger
SELECT * FROM storage_ledger WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 10;

-- Check reservation
SELECT credits_balance, credits_reserved, (credits_balance - credits_reserved) AS available
FROM storage_account WHERE user_id = '<user_id>';
```

**Likely Causes**:
1. Concurrent upload depleted available credits
2. Stuck reservation from previous upload
3. Ledger inconsistency

**Fix**:
```sql
-- Release stuck reservations
UPDATE storage_account
SET credits_reserved = 0
WHERE user_id = '<user_id>';

-- Mark abandoned uploads as failed
UPDATE uploads
SET status = 'failed', completed_at = now()
WHERE user_id = '<user_id>' AND status = 'pending' AND created_at < now() - INTERVAL '1 hour';
```

### Issue: Ledger totals don't match account balance

**Diagnosis**:
```sql
-- Get ledger total
SELECT SUM(credits_amount) FROM storage_ledger WHERE user_id = '<user_id>';

-- Get account balance
SELECT credits_balance, credits_total, credits_spent FROM storage_account WHERE user_id = '<user_id>';

-- Find discrepancy source
SELECT ledger_type, credits_amount, created_at, metadata
FROM storage_ledger
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;
```

**Likely Causes**:
1. Duplicate ledger entry (idempotency bug)
2. Missing ledger entry (finalize didn't write)
3. Manual database edit without ledger

**Fix**: Manually correct account balance and add compensating ledger entry

### Issue: High percentage of reserved credits

**Diagnosis**:
```sql
-- Check pending uploads
SELECT * FROM uploads
WHERE user_id = '<user_id>' AND status = 'pending'
ORDER BY created_at DESC;
```

**Likely Causes**:
1. User started multiple uploads but network issues
2. Client crashed during upload
3. IPFS upload taking very long

**Fix**:
```sql
-- Mark old pending as failed and release
UPDATE uploads
SET status = 'failed', completed_at = now()
WHERE user_id = '<user_id>' AND status = 'pending' AND created_at < now() - INTERVAL '1 hour';

UPDATE storage_account
SET credits_reserved = 0
WHERE user_id = '<user_id>';
```

## Automated Cleanup Jobs

### Hourly: Release Stuck Reservations

```sql
-- Mark uploads pending > 2 hours as failed
WITH stuck_uploads AS (
  SELECT id, user_id, credits_required
  FROM uploads
  WHERE status = 'pending'
    AND created_at < now() - INTERVAL '2 hours'
)
UPDATE uploads
SET status = 'failed', completed_at = now()
WHERE id IN (SELECT id FROM stuck_uploads);

-- Release reservations for failed uploads
WITH failed_uploads AS (
  SELECT user_id, SUM(credits_required) AS total_credits
  FROM uploads
  WHERE status = 'failed'
    AND completed_at > now() - INTERVAL '1 hour'
  GROUP BY user_id
)
UPDATE storage_account sa
SET credits_reserved = GREATEST(0, credits_reserved - fu.total_credits)
FROM failed_uploads fu
WHERE sa.user_id = fu.user_id;
```

### Daily: Ledger Consistency Check

Run ledger consistency query and alert on discrepancies > 10 credits.

### Weekly: Storage Utilization Report

Generate report for users at 80%+ utilization and send upgrade prompts.

## Performance Considerations

### Index Health

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('storage_account', 'uploads', 'storage_ledger')
ORDER BY idx_scan DESC;
```

### Slow Queries

Monitor Supabase dashboard for slow queries. Key operations should be < 50ms:
- `reserve_credits_for_upload`: < 20ms
- `finalize_upload_transaction`: < 50ms
- `release_credits_for_failed_upload`: < 10ms

## Security Monitoring

### Suspicious Activity

```sql
-- Unusual upload patterns
SELECT
  user_id,
  COUNT(*) AS uploads_last_hour,
  SUM(file_size_bytes) / (1024*1024*1024.0) AS total_gb_last_hour
FROM uploads
WHERE created_at > now() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 100 OR SUM(file_size_bytes) / (1024*1024*1024.0) > 10
ORDER BY uploads_last_hour DESC;

-- Multiple failed finalize attempts
SELECT
  upload_id,
  COUNT(*) AS finalize_attempts
FROM storage_ledger
WHERE ledger_type = 'charge_upload'
  AND created_at > now() - INTERVAL '1 hour'
GROUP BY upload_id
HAVING COUNT(*) > 3
ORDER BY finalize_attempts DESC;
```

**Alert on**:
- User uploads > 100 files/hour
- User uploads > 10 GB/hour
- Multiple finalize attempts for same upload

## Summary

This monitoring setup provides:
- ✅ Real-time visibility into system health
- ✅ Automated detection of stuck reservations
- ✅ Ledger consistency verification
- ✅ Upload success rate tracking
- ✅ Suspicious activity detection
- ✅ Structured logging for debugging
- ✅ Automated cleanup jobs

**Next Steps**:
1. Set up monitoring dashboard (Grafana/Metabase)
2. Configure alerts (email/Slack)
3. Schedule automated cleanup jobs
4. Review metrics weekly
