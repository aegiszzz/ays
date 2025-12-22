# Storage System - Beta Release

**Status**: Ready for invite-only beta launch
**Scope**: Core upload functionality with storage accounting
**Timeline**: This week

---

## Quick Links

- **[Beta Scope Freeze](BETA_SCOPE_FREEZE.md)** - What's active vs inactive
- **[Beta Deployment Guide](BETA_DEPLOY.md)** - Step-by-step deployment (~1 hour)
- **[Beta Testing Checklist](BETA_TESTING_CHECKLIST.md)** - Test scenarios and SQL checks
- **[Storage System README](STORAGE_SYSTEM_README.md)** - Full system architecture

---

## ✅ What's Active in Beta

### Core Features
1. **Upload Flow** - begin → IPFS → finalize
2. **Storage Accounting** - Credits system (1 KB = 1 credit)
3. **File Size Limits** - Quota check before upload
4. **Basic Rate Limiting** - 100 uploads/hour per user
5. **Cleanup Job** - Fail stuck uploads (> 2 hours), release credits

### What Works
- Image uploads (full resolution)
- Video uploads (full resolution)
- Credits deduction
- Concurrent uploads (with reservation)
- Error handling (storage limit, rate limit)
- Audit trail (storage_ledger)

---

## 🔒 What's Inactive (Code Exists, Not Used)

### Future Features
1. **Thumbnail Pipeline** - Database ready, not connected to UI
2. **Purchase Idempotency** - No payments in beta
3. **Dashboard** - SQL queries ready, no Metabase
4. **Advanced Rate Limiting** - Only begin-upload protected
5. **Account Freeze** - Manual only, no automation

### Why Not Now?
- Small beta user count (invite-only)
- Want fast, stable launch
- Gather feedback first
- Enable later based on demand

---

## 📱 Frontend Requirements (Minimal)

### Simple Upload Flow

```typescript
// 1. Check quota (optional)
const { can_upload } = await checkQuota(fileSize);

// 2. Begin upload
const { upload_id } = await beginUpload(fileSize);

// 3. Upload to IPFS
const ipfsCid = await uploadToIPFS(fileUri);

// 4. Finalize
await finalizeUpload(upload_id, ipfsCid);
```

**NO THUMBNAILS** - Just full resolution uploads

### Error Handling

```typescript
if (error.code === 'RATE_LIMIT_EXCEEDED') {
  Alert.alert('Too many uploads', 'Please wait a few minutes');
} else if (error.code === 'STORAGE_LIMIT_REACHED') {
  Alert.alert('Storage full', 'Delete old uploads to continue');
}
```

---

## 🚀 Deployment (1 Hour)

1. **Verify Database** (5 min)
   - Migrations applied
   - Functions working

2. **Deploy Edge Functions** (10 min)
   - begin-upload
   - finalize-upload
   - fail-upload
   - check-upload-quota
   - get-storage-summary
   - cleanup-job

3. **Schedule Cleanup Cron** (5 min)
   - Hourly execution
   - Test manually first

4. **Create Test Users** (5 min)
   - Add 10 GB credits

5. **Frontend Integration** (15 min)
   - Implement upload flow
   - Handle errors

6. **Smoke Test** (10 min)
   - Upload file
   - Test storage limit
   - Test rate limit

7. **Monitoring Setup** (5 min)
   - Save SQL queries for daily checks

8. **Invite Beta Users** (5 min)
   - Send invite emails
   - Grant credits

See **[BETA_DEPLOY.md](BETA_DEPLOY.md)** for detailed steps.

---

## 🧪 Testing Checklist

### Before Launch
- [ ] Upload image successfully
- [ ] Upload video successfully
- [ ] Storage limit error works
- [ ] Rate limit error works
- [ ] Concurrent uploads work
- [ ] Cleanup job releases stuck uploads

### Daily Monitoring
- [ ] Check upload success rate (> 95%)
- [ ] Check stuck uploads (should be 0)
- [ ] Review error logs
- [ ] Check Pinata bandwidth

See **[BETA_TESTING_CHECKLIST.md](BETA_TESTING_CHECKLIST.md)** for full tests.

---

## 📊 Key Metrics

### Success Criteria
- ✅ Upload success rate > 95%
- ✅ Zero data loss
- ✅ No incorrect charges
- ✅ Rate limiting works
- ✅ Cleanup job runs reliably

### Performance Targets
| Metric | Target |
|--------|--------|
| Upload (1 MB) | < 5s |
| begin-upload API | < 150ms |
| finalize-upload API | < 200ms |
| Feed query (20 items) | < 150ms |

---

## 🔧 Daily Operations

### SQL Queries for Monitoring

```sql
-- Upload success rate
SELECT
  COUNT(*) FILTER (WHERE status = 'complete') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'complete')::numeric /
    NULLIF(COUNT(*), 0) * 100, 2
  ) AS success_rate
FROM uploads
WHERE created_at > now() - INTERVAL '24 hours';

-- Stuck uploads
SELECT COUNT(*) FROM uploads
WHERE status = 'pending' AND created_at < now() - INTERVAL '2 hours';

-- Storage usage
SELECT
  COUNT(*) AS users,
  SUM(credits_spent) / 1048576.0 AS total_gb_used
FROM storage_account;
```

---

## 🆘 Emergency Procedures

### Unstick Upload
```sql
UPDATE uploads SET status = 'failed', completed_at = now()
WHERE id = '<upload_id>';

UPDATE storage_account
SET credits_reserved = credits_reserved - <amount>
WHERE user_id = '<user_id>';
```

### Reset Rate Limit
```sql
DELETE FROM rate_limits WHERE user_id = '<user_id>';
```

### Add Credits
```sql
SELECT add_storage_credits(
  '<user_id>',
  10485760, -- 10 GB
  'manual',
  'beta_bonus',
  NULL, NULL,
  '{"reason": "Beta bonus"}'::jsonb
);
```

---

## 📈 Post-Beta Roadmap

### Phase 1 (After Beta Feedback)
- Enable thumbnail pipeline
- Set up Metabase dashboard
- Enable advanced rate limiting

### Phase 2 (When Adding Payments)
- Enable purchase idempotency
- Stripe webhook
- Solana payments

### Phase 3 (Scale)
- CDN for thumbnails
- Automated abuse detection
- Advanced monitoring

---

## 📧 Beta Invite Template

```
Welcome to [App Name] Beta!

Your beta account:
- 10 GB free storage
- Unlimited uploads (100/hour limit)

Known limitations:
- No thumbnails yet (full res loads)
- Small user group (invite-only)

Report issues: beta@yourapp.com

Thanks for being an early adopter!
```

---

## 🎯 What Success Looks Like

After 2 weeks of beta:
- 50+ beta users invited
- 1000+ successful uploads
- < 5% error rate
- Zero data loss
- Positive feedback
- Clear feature priorities for v1

---

## File Structure

```
BETA_README.md              ← You are here
BETA_SCOPE_FREEZE.md        ← Active vs inactive features
BETA_DEPLOY.md              ← Deployment steps
BETA_TESTING_CHECKLIST.md   ← Test scenarios
STORAGE_SYSTEM_README.md    ← Full architecture
STORAGE_MONITORING_GUIDE.md ← SQL queries (full system)
BANDWIDTH_OPTIMIZATION_GUIDE.md ← Thumbnails (future)
PRODUCTION_IMPLEMENTATION_GUIDE.md ← Advanced features (future)
```

---

## Support

- **Documentation**: Check this folder for detailed guides
- **Database**: All functions documented in migrations
- **Issues**: Check BETA_TESTING_CHECKLIST.md for troubleshooting
- **Questions**: Reference BETA_SCOPE_FREEZE.md for scope clarification

---

**Ready to launch beta!** 🎉

Next step: Follow **[BETA_DEPLOY.md](BETA_DEPLOY.md)**
