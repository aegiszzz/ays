# Storage Quota + Internal Credits Accounting - Test Checklist

This document provides a comprehensive testing checklist for the Storage Quota system.

## System Overview

- **User-Facing**: All storage displayed in GB only
- **Backend**: Internal credits accounting (hidden from users)
- **Mapping**: 1 MB = 100 credits, 1 GB = 102,400 credits
- **Free Plan**: 3 GB (307,200 credits)
- **Safety**: Atomic transactions, no negative balances, concurrent upload protection

---

## Test Checklist

### ✅ 1. New User Gets 3 GB Free Storage

**Test Steps:**
1. Create a new user account via signup
2. Navigate to Settings tab
3. Check storage display

**Expected Results:**
- Storage section shows "Plan: Free (3 GB)"
- Total: 3.00 GB
- Used: 0.00 GB
- Remaining: 3.00 GB
- Progress bar at 0%

**Database Verification:**
```sql
SELECT credits_balance, credits_total, credits_spent
FROM storage_account
WHERE user_id = '<new_user_id>';
```
Expected: `credits_balance = 307200, credits_total = 307200, credits_spent = 0`

---

### ✅ 2. Upload Reduces Remaining Storage

**Test Steps:**
1. Upload a small image (e.g., 500 KB)
2. Wait for upload to complete
3. Check storage summary in Settings

**Expected Results:**
- Used GB increases by ~0.0005 GB
- Remaining GB decreases by ~0.0005 GB
- Progress bar updates
- No error messages

**Database Verification:**
```sql
-- Check storage account was debited
SELECT credits_balance, credits_spent FROM storage_account WHERE user_id = '<user_id>';

-- Check upload record is complete
SELECT status, credits_charged, file_size_bytes FROM uploads WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 1;
```

Expected:
- `credits_balance` decreased
- `credits_spent` increased
- Upload status = 'complete'

---

### ✅ 3. Insufficient Storage Blocks Upload

**Test Steps:**
1. Use a test account with very low remaining storage (~0.01 GB)
2. Attempt to upload a large file (e.g., 50 MB image or video)
3. Observe error message

**Expected Results:**
- Upload blocked before IPFS upload
- Error message: "Storage limit reached. Upgrade to get more space."
- No credits deducted
- Storage summary unchanged

**Database Verification:**
```sql
-- No new pending or failed uploads should exist
SELECT COUNT(*) FROM uploads WHERE user_id = '<user_id>' AND status = 'pending';
```
Expected: Count should not increase

---

### ✅ 4. Concurrent Uploads Cannot Go Negative

**Test Steps:**
1. Prepare two files totaling more than remaining storage (e.g., 2 files × 2 GB = 4 GB when only 3 GB available)
2. Start uploading both files simultaneously from different browser tabs/devices
3. Monitor results

**Expected Results:**
- First upload succeeds
- Second upload blocked with storage error
- Credits balance never goes negative
- No race condition errors

**Database Verification:**
```sql
SELECT credits_balance FROM storage_account WHERE user_id = '<user_id>';
```
Expected: `credits_balance >= 0` (never negative)

---

### ✅ 5. Failed Upload Does Not Charge

**Test Steps:**
1. Start an upload
2. Simulate failure (e.g., network disconnection, force-close app during IPFS upload)
3. Check storage summary

**Expected Results:**
- Upload marked as 'failed' in database
- No credits deducted
- Storage summary unchanged
- Remaining GB same as before upload attempt

**Database Verification:**
```sql
SELECT status, credits_charged FROM uploads WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 1;
```
Expected: `status = 'failed'`

```sql
SELECT credits_balance FROM storage_account WHERE user_id = '<user_id>';
```
Expected: Same balance as before upload attempt

---

### ✅ 6. Upgrade Adds Storage and Updates UI

**Test Steps:**
1. Note current storage (e.g., 1.5 GB / 3 GB)
2. Call add-storage edge function to add 10 GB:
   ```javascript
   await addStorage(10); // From useStorage hook
   ```
3. Check storage summary in Settings

**Expected Results:**
- Total increases to 13.00 GB
- Remaining increases by 10.00 GB
- Used GB stays the same
- Progress bar percentage recalculated
- UI updates automatically

**Database Verification:**
```sql
SELECT credits_balance, credits_total, credits_spent FROM storage_account WHERE user_id = '<user_id>';
```
Expected:
- `credits_total` increased by 1,024,000 credits (10 GB)
- `credits_balance` increased by 1,024,000 credits
- `credits_spent` unchanged

---

## Additional Test Scenarios

### 7. Storage Summary Accuracy

**Test Steps:**
1. Upload multiple files of known sizes
2. Calculate expected used storage
3. Compare with displayed values

**Expected Results:**
- Used GB matches sum of uploaded file sizes (within rounding)
- Total - Used = Remaining
- Percentage calculation accurate

---

### 8. Storage Warning Display

**Test Steps:**
1. Use storage until 70-79% full
2. Check for warnings
3. Use storage until 80-89% full
4. Check for warnings
5. Use storage until 90%+ full
6. Check for warnings

**Expected Results:**
- 0-69%: No warning
- 70-79%: No warning (optional: consider adding)
- 80-89%: Warning "Storage running low" (yellow)
- 90-100%: Warning "Storage almost full" (orange/red)

---

### 9. Upload with Exact Remaining Storage

**Test Steps:**
1. Calculate exact remaining storage
2. Upload file of exact size
3. Verify success

**Expected Results:**
- Upload succeeds
- Remaining storage = 0.00 GB
- Next upload attempt blocked

---

### 10. Retry After Failed Upload

**Test Steps:**
1. Attempt upload that fails
2. Fix issue (e.g., restore network)
3. Retry same upload

**Expected Results:**
- First attempt creates 'failed' upload record
- Retry creates new 'pending' record
- No double charging
- Success on retry

---

## Edge Function Testing

### Get Storage Summary

```bash
curl -X GET \
  'https://YOUR_PROJECT.supabase.co/functions/v1/get-storage-summary' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN'
```

Expected Response:
```json
{
  "total_gb": 3.00,
  "used_gb": 0.52,
  "remaining_gb": 2.48,
  "percentage_used": 17
}
```

---

### Check Upload Quota

```bash
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/check-upload-quota' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"file_size_bytes": 5242880}'
```

Expected Response (sufficient storage):
```json
{
  "can_upload": true,
  "required_credits": 500,
  "available_credits": 307200,
  "remaining_gb": 3.00,
  "message": "Upload allowed"
}
```

Expected Response (insufficient storage):
```json
{
  "can_upload": false,
  "required_credits": 500000,
  "available_credits": 100,
  "remaining_gb": 0.00,
  "message": "Storage limit reached. Upgrade to get more space."
}
```

---

### Begin Upload

```bash
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/begin-upload' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"file_size_bytes": 1048576}'
```

Expected Response:
```json
{
  "upload_id": "uuid-here",
  "credits_to_charge": 100,
  "message": "Upload initiated. Complete upload to finalize."
}
```

---

### Finalize Upload

```bash
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/finalize-upload' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "upload_id": "uuid-here",
    "ipfs_cid": "QmYour...",
    "media_share_id": "uuid-here"
  }'
```

Expected Response:
```json
{
  "message": "Upload finalized successfully",
  "upload_id": "uuid-here",
  "credits_charged": 100
}
```

---

### Add Storage

```bash
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/add-storage' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"gb_to_add": 10}'
```

Expected Response:
```json
{
  "message": "Successfully added 10 GB to your storage",
  "gb_added": 10,
  "credits_added": 1024000
}
```

---

## Performance Testing

### Concurrent Upload Stress Test

**Test Steps:**
1. Create 10 simultaneous upload requests
2. Monitor database for race conditions
3. Verify all succeed or fail gracefully

**Expected Results:**
- No database deadlocks
- No negative balances
- All requests complete (success or quota error)

---

## UI/UX Validation

### ✅ User Never Sees "Credits"

**Check These Screens:**
- Settings → Storage section
- Upload modal error messages
- Any storage-related notifications

**Expected:**
- Only GB terminology used
- No mention of "credits", "tokens", "points", etc.
- Error messages say "Storage limit reached"

---

### ✅ Storage Display Formatting

**Verify:**
- GB values show 2 decimal places (e.g., "2.47 GB")
- Progress bar animates smoothly
- Colors indicate status (green → yellow → red)
- Mobile and web responsive

---

## Database Integrity Checks

### Check for Orphaned Records

```sql
-- Uploads without media_shares (acceptable if failed/pending)
SELECT COUNT(*) FROM uploads WHERE media_share_id IS NULL AND status = 'complete';
```
Expected: 0

### Check for Negative Balances

```sql
SELECT COUNT(*) FROM storage_account WHERE credits_balance < 0;
```
Expected: 0

### Check Credits Math

```sql
SELECT
  user_id,
  credits_total,
  credits_balance,
  credits_spent,
  (credits_balance + credits_spent) as calculated_total,
  (credits_total - (credits_balance + credits_spent)) as discrepancy
FROM storage_account
WHERE (credits_balance + credits_spent) != credits_total;
```
Expected: 0 rows (no discrepancies)

---

## Summary

**Critical Tests:**
1. ✅ New user gets 3 GB
2. ✅ Upload reduces remaining GB
3. ✅ Insufficient storage blocks upload
4. ✅ Concurrent uploads safe
5. ✅ Failed upload doesn't charge
6. ✅ Upgrade adds GB and updates UI

**Safety Guarantees:**
- No negative balances possible
- Atomic transactions prevent race conditions
- Failed uploads never charge credits
- UI shows only GB (never credits)

**Test Completion:**
- [ ] All 6 critical tests passed
- [ ] Edge functions tested
- [ ] Database integrity verified
- [ ] UI/UX validation complete
- [ ] Performance testing done
