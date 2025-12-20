/**
 * Storage Quota + Internal Credits Accounting System
 *
 * This module handles storage accounting using internal credits
 * while presenting all user-facing data in GB.
 *
 * IMPORTANT:
 * - Users NEVER see credits
 * - All UI displays storage in GB only
 * - Credits are internal accounting units only
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Credit Mapping Configuration
 * - 1 MB = 100 credits
 * - 1 GB = 100,000 credits
 * - 3 GB (free plan) = 300,000 credits
 */
export const CREDITS_PER_MB = 100;
export const FREE_PLAN_GB = 3;
export const FREE_PLAN_CREDITS = FREE_PLAN_GB * 1024 * CREDITS_PER_MB; // 307,200 credits

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

/**
 * Convert bytes to megabytes
 */
export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

/**
 * Convert megabytes to gigabytes
 */
export function mbToGB(mb: number): number {
  return mb / 1024;
}

/**
 * Convert bytes to gigabytes
 */
export function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/**
 * Convert megabytes to credits (always ceiling to prevent fractional credits)
 * This ensures we always charge at least 1 credit for tiny files
 */
export function mbToCredits(mb: number): number {
  return Math.ceil(mb * CREDITS_PER_MB);
}

/**
 * Convert bytes to credits
 */
export function bytesToCredits(bytes: number): number {
  const mb = bytesToMB(bytes);
  return mbToCredits(mb);
}

/**
 * Convert credits to gigabytes (for reporting to users)
 * Returns a number rounded to 2 decimal places
 */
export function creditsToGB(credits: number): number {
  const mb = credits / CREDITS_PER_MB;
  const gb = mbToGB(mb);
  return Math.round(gb * 100) / 100; // Round to 2 decimal places
}

/**
 * Convert gigabytes to credits (for adding storage)
 */
export function gbToCredits(gb: number): number {
  const mb = gb * 1024;
  return Math.ceil(mb * CREDITS_PER_MB);
}

// ============================================================================
// STORAGE SUMMARY TYPES
// ============================================================================

export interface StorageSummary {
  total_gb: number;      // Total storage allocated (free + purchased)
  used_gb: number;       // Storage consumed
  remaining_gb: number;  // Storage available
  percentage_used: number; // Usage percentage (0-100)
}

export interface StorageAccount {
  user_id: string;
  credits_balance: number;
  credits_total: number;
  credits_spent: number;
  created_at: string;
  updated_at: string;
}

export interface Upload {
  id: string;
  user_id: string;
  file_size_bytes: number;
  credits_charged: number;
  status: 'pending' | 'complete' | 'failed';
  ipfs_cid: string | null;
  media_share_id: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================================================
// STORAGE SUMMARY CALCULATION
// ============================================================================

/**
 * Calculate storage summary from storage account data
 * Returns user-facing storage information in GB only
 */
export function calculateStorageSummary(account: StorageAccount): StorageSummary {
  const total_gb = creditsToGB(account.credits_total);
  const used_gb = creditsToGB(account.credits_spent);
  const remaining_gb = creditsToGB(account.credits_balance);

  const percentage_used = account.credits_total > 0
    ? Math.round((account.credits_spent / account.credits_total) * 100)
    : 0;

  return {
    total_gb,
    used_gb,
    remaining_gb,
    percentage_used,
  };
}

// ============================================================================
// UPLOAD VALIDATION
// ============================================================================

/**
 * Calculate required credits for a file upload
 */
export function calculateRequiredCredits(fileSizeBytes: number): number {
  return bytesToCredits(fileSizeBytes);
}

/**
 * Check if user has sufficient storage for an upload
 */
export function canUpload(account: StorageAccount, fileSizeBytes: number): boolean {
  const required = calculateRequiredCredits(fileSizeBytes);
  return account.credits_balance >= required;
}

/**
 * Get user-friendly error message for insufficient storage
 */
export function getInsufficientStorageMessage(): string {
  return 'Storage limit reached. Upgrade to get more space.';
}

/**
 * Format storage amount for display (e.g., "2.5 GB", "150 MB")
 */
export function formatStorageAmount(bytes: number): string {
  const gb = bytesToGB(bytes);

  if (gb >= 0.1) {
    return `${gb.toFixed(2)} GB`;
  }

  const mb = bytesToMB(bytes);
  return `${mb.toFixed(2)} MB`;
}

/**
 * Format storage summary for display
 */
export function formatStorageSummary(summary: StorageSummary): string {
  return `${summary.used_gb.toFixed(2)} GB / ${summary.total_gb.toFixed(2)} GB`;
}
