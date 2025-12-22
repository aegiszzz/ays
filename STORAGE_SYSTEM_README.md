# Storage Quota + Internal Credits Accounting System

## Overview

This system implements a robust storage quota management system for the media sharing app with the following key features:

- **User-Facing**: All storage information displayed in GB only
- **Backend**: Internal credits-based accounting (completely hidden from users)
- **Free Plan**: Every new user gets 3 GB free storage
- **Safety**: Atomic transactions, concurrent upload protection, no negative balances
- **Security**: Idempotency protection, audit trail, standardized error codes
- **Reliability**: Ledger-based accounting, soft delete, enhanced auth validation

## Architecture

### Credit Mapping

```
CREDITS_PER_MB = 100

1 MB = 100 credits
1 GB = 1024 MB = 102,400 credits
3 GB (Free Plan) = 307,200 credits
```

**⚠️ Important**: This mapping is **immutable**. Changing it requires a full migration of all existing accounts and ledger entries. The value must be consistent across:
- Edge functions
- Database functions
- Client-side calculations

**Centralization**: The constant is defined in each edge function. For changes, update all 6 edge functions simultaneously.

### Data Model

#### `storage_account` Table
```sql
user_id              uuid        Primary key, references auth.users
credits_balance      bigint      Available credits (>= 0)
credits_reserved     bigint      Credits reserved for pending uploads
credits_total        bigint      Total credits allocated (free + purchased)
credits_spent        bigint      Total credits consumed
created_at           timestamptz Account creation timestamp
updated_at           timestamptz Last modification timestamp
```

**Note on credits_reserved**:
- Reserved during `begin-upload` to prevent concurrent upload UX issues
- Released during `finalize-upload` or `fail-upload`
- Constraint: `credits_balance >= credits_reserved`
- **Available credits** = `credits_balance - credits_reserved`

#### `uploads` Table
```sql
id                   uuid        Primary key
user_id              uuid        References auth.users
file_size_bytes      bigint      Actual file size
credits_required     bigint      Credits calculated at begin (immutable)
credits_charged      bigint      Credits actually deducted (set at complete)
status               text        'pending', 'complete', or 'failed'
ipfs_cid             text        IPFS content identifier (nullable)
media_share_id       uuid        References media_shares (nullable)
idempotency_key      text        Client-provided key for duplicate prevention (nullable)
deleted_at           timestamptz Soft delete timestamp (nullable)
created_at           timestamptz Upload initiation timestamp
completed_at         timestamptz Upload completion timestamp (nullable)
```

**Note**: `idempotency_key` prevents duplicate charges from network retries. Unique constraint on (user_id, idempotency_key).

#### `storage_ledger` Table (Audit Trail)
```sql
id                   uuid        Primary key
user_id              uuid        References auth.users
ledger_type          text        'grant_free', 'charge_upload', 'purchase_add_storage', 'admin_adjust', 'refund_upload'
credits_amount       bigint      Credit change (positive for additions, negative for charges)
upload_id            uuid        References uploads (nullable)
reference            text        External reference (payment tx, admin ticket) (nullable)
metadata             jsonb       Additional context (file_size, error_message, etc.)
created_at           timestamptz Transaction timestamp
```

**Purpose**: Immutable audit log of all credit transactions for debugging and fraud detection.

## Backend Components

### 1. Utility Functions (`lib/storage.ts`)

```typescript
// Conversion functions
bytesToMB(bytes: number): number
mbToGB(mb: number): number
bytesToGB(bytes: number): number
mbToCredits(mb: number): number
bytesToCredits(bytes: number): number
creditsToGB(credits: number): number
gbToCredits(gb: number): number

// Storage summary
calculateStorageSummary(account: StorageAccount): StorageSummary

// Upload validation
calculateRequiredCredits(fileSizeBytes: number): number
canUpload(account: StorageAccount, fileSizeBytes: number): boolean
getInsufficientStorageMessage(): string
```

### 2. Edge Functions

#### `get-storage-summary`
**Purpose**: Fetch user's storage information in GB

**Endpoint**: `GET /functions/v1/get-storage-summary`

**Authentication**: Required (JWT)

**Response**:
```json
{
  "total_gb": 3.00,
  "used_gb": 0.52,
  "remaining_gb": 2.48,
  "percentage_used": 17
}
```

---

#### `check-upload-quota`
**Purpose**: Check if user has sufficient storage for an upload

**Endpoint**: `POST /functions/v1/check-upload-quota`

**Authentication**: Required (JWT)

**Request**:
```json
{
  "file_size_bytes": 5242880
}
```

**Response** (sufficient):
```json
{
  "can_upload": true,
  "required_credits": 500,
  "available_credits": 307200,
  "remaining_gb": 3.00,
  "message": "Upload allowed"
}
```

**Response** (insufficient):
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

#### `begin-upload`
**Purpose**: Create pending upload record (pre-flight check)

**Endpoint**: `POST /functions/v1/begin-upload`

**Authentication**: Required (JWT)

**Request**:
```json
{
  "file_size_bytes": 1048576
}
```

**Response** (success):
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "credits_to_charge": 100,
  "message": "Upload initiated. Complete upload to finalize."
}
```

**Response** (insufficient storage):
```json
{
  "error": "Storage limit reached. Upgrade to get more space.",
  "can_upload": false
}
```

---

#### `finalize-upload`
**Purpose**: Atomically deduct credits after successful IPFS upload

**Endpoint**: `POST /functions/v1/finalize-upload`

**Authentication**: Required (JWT)

**Request**:
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "ipfs_cid": "QmYourIPFSHashHere",
  "media_share_id": "660e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:
```json
{
  "message": "Upload finalized successfully",
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "credits_charged": 100
}
```

**Safety Features**:
- Uses `SELECT ... FOR UPDATE` to lock account row
- Prevents concurrent modifications
- Checks for sufficient balance before deduction
- Rolls back transaction on error
- Updates `uploads` status to 'complete'

---

#### `fail-upload`
**Purpose**: Mark upload as failed (NO credit deduction)

**Endpoint**: `POST /functions/v1/fail-upload`

**Authentication**: Required (JWT)

**Request**:
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "error_message": "Network error"
}
```

**Response**:
```json
{
  "message": "Upload marked as failed. No charges applied.",
  "upload_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

#### `add-storage`
**Purpose**: Add purchased storage to user's account

**Endpoint**: `POST /functions/v1/add-storage`

**Authentication**: Required (JWT)

**Request**:
```json
{
  "gb_to_add": 10
}
```

**Response**:
```json
{
  "message": "Successfully added 10 GB to your storage",
  "gb_added": 10,
  "credits_added": 1024000
}
```

---

### 3. Database Functions

#### `finalize_upload_transaction`
**Purpose**: Atomic credit deduction with row-level locking

**Usage**:
```sql
SELECT finalize_upload_transaction(
  p_user_id := 'user-uuid',
  p_upload_id := 'upload-uuid',
  p_credits_to_charge := 100,
  p_ipfs_cid := 'QmHash',
  p_media_share_id := 'media-uuid'
);
```

**Returns**:
```json
{
  "success": true,
  "new_balance": 307100,
  "credits_charged": 100
}
```

**Safety Features**:
- `SELECT ... FOR UPDATE` locks row
- Prevents negative balance
- Atomic transaction (all-or-nothing)
- Returns error if insufficient credits

---

#### `add_storage_credits`
**Purpose**: Add credits when user purchases storage

**Usage**:
```sql
SELECT add_storage_credits(
  p_user_id := 'user-uuid',
  p_credits_to_add := 1024000
);
```

---

## Frontend Components

### Hook: `useStorage`

```typescript
import { useStorage } from '@/hooks/useStorage';

function Component() {
  const {
    storageSummary,           // StorageSummary | null
    loading,                  // boolean
    error,                    // string | null
    fetchStorageSummary,      // () => Promise<StorageSummary>
    checkUploadQuota,         // (bytes) => Promise<UploadQuotaCheck>
    beginUpload,              // (bytes) => Promise<BeginUploadResult>
    finalizeUpload,           // (id, cid, shareId?) => Promise<boolean>
    failUpload,               // (id, msg?) => Promise<boolean>
    addStorage,               // (gb) => Promise<boolean>
    formatStorage,            // (summary) => string
    getStorageStatusColor,    // (percentage) => string
  } = useStorage();

  return (
    <Text>
      {storageSummary && formatStorage(storageSummary)}
    </Text>
  );
}
```

---

## Upload Flow

### Standard Upload Process

```typescript
// 1. User selects file
const fileUri = 'file://path/to/image.jpg';
const fileInfo = await FileSystem.getInfoAsync(fileUri);
const fileSizeBytes = fileInfo.size;

// 2. Check quota (optional, pre-flight)
const quotaCheck = await checkUploadQuota(fileSizeBytes);
if (!quotaCheck.can_upload) {
  // Show error: "Storage limit reached. Upgrade to get more space."
  return;
}

// 3. Begin upload (creates pending record)
let uploadId: string;
try {
  const uploadRecord = await beginUpload(fileSizeBytes);
  if (!uploadRecord) {
    throw new Error('Storage limit reached. Upgrade to get more space.');
  }
  uploadId = uploadRecord.upload_id;
} catch (error) {
  // Show error message
  return;
}

// 4. Upload to IPFS
let ipfsCid: string;
try {
  ipfsCid = await uploadToIPFS(base64Data);
} catch (error) {
  // Mark as failed (no charge)
  await failUpload(uploadId, error.message);
  return;
}

// 5. Save to database
let mediaShareId: string;
try {
  const { data, error } = await supabase
    .from('media_shares')
    .insert({ user_id, ipfs_cid, media_type, caption })
    .select()
    .single();

  if (error) throw error;
  mediaShareId = data.id;
} catch (error) {
  await failUpload(uploadId, error.message);
  return;
}

// 6. Finalize upload (atomic credit deduction)
const finalized = await finalizeUpload(uploadId, ipfsCid, mediaShareId);
if (!finalized) {
  // Handle error (credits may not have been deducted)
  return;
}

// 7. Success! Refresh UI
await fetchStorageSummary();
```

---

## UI Guidelines

### ✅ DO: Use GB Terminology

```typescript
// ✅ CORRECT
<Text>Used: {summary.used_gb.toFixed(2)} GB / {summary.total_gb.toFixed(2)} GB</Text>
<Text>Free plan: 3 GB storage</Text>
<Text>Storage limit reached. Upgrade to get more space.</Text>
```

### ❌ DON'T: Expose Credits

```typescript
// ❌ WRONG - Never do this
<Text>You have {account.credits_balance} credits</Text>
<Text>Upload costs 100 credits</Text>
<Text>Earn more credits by...</Text>
```

---

## Safety Features

### 1. Atomic Transactions

The `finalize_upload_transaction` PostgreSQL function uses:
- `SELECT ... FOR UPDATE` to lock the account row
- Transaction block ensures atomicity
- Automatic rollback on errors

### 2. Concurrent Upload Protection

```sql
-- Lock acquired on first upload
SELECT credits_balance FROM storage_account WHERE user_id = ? FOR UPDATE;

-- Second concurrent upload waits here until first completes
-- Then checks balance (may now be insufficient)
```

### 3. No Negative Balances

```sql
-- CHECK constraint on credits_balance
credits_balance bigint NOT NULL DEFAULT 0 CHECK (credits_balance >= 0)

-- Function validation before deduction
IF v_current_balance < p_credits_to_charge THEN
  RAISE EXCEPTION 'Insufficient credits';
END IF;
```

### 4. Failed Uploads Don't Charge

- Upload status remains 'pending' during IPFS upload
- Only 'complete' status triggers credit deduction
- 'failed' status leaves credits unchanged

---

## Storage Display Examples

### Settings Screen

```
┌─────────────────────────────────────┐
│ Storage                             │
├─────────────────────────────────────┤
│ 💾 Plan: Free (3 GB)                │
│                                     │
│ ████████░░░░░░░░░░░░░░░░░░░░ 45%  │
│                                     │
│ Used:       1.35 GB                 │
│ Remaining:  1.65 GB                 │
│ Total:      3.00 GB                 │
└─────────────────────────────────────┘
```

### Upload Error

```
┌─────────────────────────────────────┐
│ ⚠️ Storage limit reached.           │
│    Upgrade to get more space.       │
└─────────────────────────────────────┘
```

### Low Storage Warning (80%+)

```
┌─────────────────────────────────────┐
│ ⚠️ Storage running low              │
└─────────────────────────────────────┘
```

### Critical Storage Warning (90%+)

```
┌─────────────────────────────────────┐
│ 🚨 Storage almost full              │
└─────────────────────────────────────┘
```

---

## Upgrade/Purchase Flow (Beta)

When a user purchases additional storage:

```typescript
// User purchases 10 GB plan
const success = await addStorage(10);

if (success) {
  // UI automatically updates via useEffect
  // storageSummary.total_gb now shows 13 GB
  // storageSummary.remaining_gb increased by 10 GB
}
```

**Backend**:
- Adds 1,024,000 credits (10 GB × 1024 MB × 100 credits/MB)
- Updates `credits_total` and `credits_balance`
- `credits_spent` remains unchanged

---

## Deletion Policy (Beta)

**Current Behavior**: Deleting media does NOT refund credits

**Rationale**:
- Prevents abuse (upload/delete cycling)
- Simpler accounting
- Industry standard (AWS S3, etc.)

**Future Consideration**:
- Could implement time-based refunds (e.g., delete within 24 hours)
- Requires additional complexity for tracking

---

## Troubleshooting

### Issue: Storage summary not updating

**Solution**: Call `fetchStorageSummary()` after operations
```typescript
await finalizeUpload(uploadId, ipfsCid, mediaShareId);
await fetchStorageSummary(); // Refresh UI
```

---

### Issue: "Upload failed" but credits deducted

**Check**:
```sql
SELECT * FROM uploads WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 5;
```

If status is 'complete', credits were correctly deducted.
If status is 'failed', no credits should be deducted.

**Fix**:
If credits were incorrectly deducted, manually refund:
```sql
UPDATE storage_account
SET credits_balance = credits_balance + <amount>,
    credits_spent = credits_spent - <amount>
WHERE user_id = '<user_id>';
```

---

### Issue: Negative balance in database

**This should NEVER happen due to constraints**

**Check**:
```sql
SELECT * FROM storage_account WHERE credits_balance < 0;
```

**If found** (database corruption):
```sql
-- Reset to zero (emergency fix)
UPDATE storage_account SET credits_balance = 0 WHERE credits_balance < 0;
```

**Investigate**: Check application logs for transaction errors

---

## Performance Considerations

### Database Indexes

```sql
-- Already created in migration
CREATE INDEX idx_storage_account_user_id ON storage_account(user_id);
CREATE INDEX idx_uploads_user_id ON uploads(user_id);
CREATE INDEX idx_uploads_status ON uploads(status);
```

### Caching

The `useStorage` hook caches storage summary in state.
Refresh when:
- Upload completes
- Storage purchased
- User navigates to Settings

---

## Security & Audit Features

### 1. Idempotency Protection

**Problem**: Mobile network retries, double-taps, or "back-forward" navigation can cause duplicate requests.

**Solution**: `idempotency_key` field in uploads table with unique constraint.

```typescript
// Client generates idempotency key
const idempotencyKey = `${userId}-${Date.now()}-${Math.random()}`;

// begin-upload with idempotency key
const response = await fetch('/functions/v1/begin-upload', {
  method: 'POST',
  body: JSON.stringify({
    file_size_bytes: 1048576,
    idempotency_key: idempotencyKey
  })
});

// If same key is sent again, returns same upload_id (idempotent)
```

**Benefits**:
- Prevents double charging on network retry
- Safe to retry failed requests
- Database enforces uniqueness per user

### 2. Storage Ledger (Audit Trail)

**Purpose**: Complete transaction history for debugging and fraud detection.

**Ledger Types**:
- `grant_free`: Initial 3 GB free storage
- `charge_upload`: Credits deducted for upload (negative amount)
- `purchase_add_storage`: Purchased storage (positive amount)
- `admin_adjust`: Manual adjustment by admin
- `refund_upload`: Refund for deleted upload (if implemented)

**Query Examples**:
```sql
-- View user's complete transaction history
SELECT
  ledger_type,
  credits_amount,
  metadata,
  created_at
FROM storage_ledger
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;

-- Find all failed uploads (for debugging)
SELECT
  l.upload_id,
  l.metadata->>'error_message' as error,
  l.created_at
FROM storage_ledger l
WHERE l.ledger_type = 'charge_upload'
  AND l.credits_amount = 0
  AND l.metadata->>'status' = 'failed';

-- Calculate total credits from purchases
SELECT SUM(credits_amount) as total_purchased
FROM storage_ledger
WHERE user_id = '<user_id>'
  AND ledger_type = 'purchase_add_storage';
```

### 3. Standardized Error Codes

All edge functions return structured error codes for client-side handling:

```typescript
// Error response structure
{
  "error": "Storage limit reached. Upgrade to get more space.",
  "code": "STORAGE_LIMIT_REACHED",
  "required_credits": 100,
  "available_credits": 50
}

// Error codes
const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  STORAGE_ACCOUNT_NOT_FOUND: 'STORAGE_ACCOUNT_NOT_FOUND',
  STORAGE_LIMIT_REACHED: 'STORAGE_LIMIT_REACHED',
  UPLOAD_NOT_FOUND: 'UPLOAD_NOT_FOUND',
  UPLOAD_ALREADY_FAILED: 'UPLOAD_ALREADY_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

// Client-side handling
try {
  const response = await beginUpload(fileSize);
} catch (error) {
  switch (error.code) {
    case 'STORAGE_LIMIT_REACHED':
      showUpgradeModal();
      break;
    case 'UNAUTHORIZED':
      redirectToLogin();
      break;
    default:
      showGenericError();
  }
}
```

**Benefits**:
- No string matching for error detection
- Easier internationalization (i18n)
- Consistent error handling across app

### 4. Soft Delete

**Implementation**: `deleted_at` field in uploads table instead of hard delete.

**Benefits**:
- Audit trail preserved
- Recovery possible
- Analytics on deleted content

**Note**: Deleting media does NOT refund credits (prevents abuse).

### 5. Enhanced Auth Validation

**Security Checks**:
- Every edge function validates `auth.uid()` matches resource owner
- Service role used only for ledger writes (not exposed to users)
- Upload finalization validates ownership before deduction

```typescript
// finalize-upload enforces ownership
const { data: upload } = await supabase
  .from('uploads')
  .select('*')
  .eq('id', upload_id)
  .eq('user_id', user.id)  // ← Ownership check
  .single();

if (!upload) {
  return { error: 'Upload not found or access denied', code: 'UPLOAD_NOT_FOUND' };
}
```

### RLS Policies

```sql
-- Users can only view/modify their own storage
CREATE POLICY "Users can view own storage account"
  ON storage_account FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can only view their own ledger entries
CREATE POLICY "Users can view own ledger entries"
  ON storage_ledger FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role (edge functions) can manage all
CREATE POLICY "Service role can manage all storage accounts"
  ON storage_account FOR ALL
  TO service_role
  USING (true);
```

---

## Monitoring

### Key Metrics

```sql
-- Total storage allocated
SELECT SUM(credits_total) / 102400.0 AS total_gb_allocated FROM storage_account;

-- Total storage used
SELECT SUM(credits_spent) / 102400.0 AS total_gb_used FROM storage_account;

-- Average usage per user
SELECT AVG(credits_spent::float / credits_total * 100) AS avg_percentage_used
FROM storage_account
WHERE credits_total > 0;

-- Users near quota (90%+)
SELECT COUNT(*) FROM storage_account
WHERE (credits_spent::float / credits_total) > 0.9 AND credits_total > 0;
```

---

## Future Enhancements

### Potential Features

1. **Storage Plans**
   - Basic: 3 GB (free)
   - Plus: 10 GB ($2.99/month)
   - Pro: 50 GB ($9.99/month)

2. **Usage Analytics**
   - Track uploads over time
   - Show storage trends
   - Predict when user will run out

3. **Compression Options**
   - Offer lower quality = less storage
   - User choice: Original vs Compressed

4. **Refund Policy**
   - Delete within 24h = partial refund
   - Requires additional tracking table

---

## Support

For issues or questions:
- Check STORAGE_TESTING_CHECKLIST.md
- Review database logs: `SELECT * FROM uploads WHERE status = 'failed';`
- Verify RLS policies: Edge functions use service_role key

---

## Summary

✅ **Core Features**:
- Database schema with RLS
- 6 edge functions (summary, check, begin, finalize, fail, add)
- Frontend hook (useStorage)
- UI displays (Settings screen, upload errors)
- Atomic transactions with locking
- Test checklist

✅ **Safety & Security**:
- No negative balances possible
- Concurrent upload protection
- Failed uploads don't charge
- Users never see "credits"
- Idempotency protection (duplicate prevention)
- Complete audit trail (storage_ledger)
- Standardized error codes
- Enhanced auth validation
- Soft delete support

✅ **User Experience**:
- Simple GB-only interface
- Clear error messages
- Visual progress indicators
- Automatic UI updates
- Safe retry on network errors

✅ **Production Ready**:
- Comprehensive audit logging
- Debugging tools (ledger queries)
- Fraud detection support
- i18n-friendly error handling
- Recovery mechanisms (soft delete)
