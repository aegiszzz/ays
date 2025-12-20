/**
 * Storage Management Hook
 *
 * Provides functions to check storage quotas, manage uploads, and display
 * storage information to users in GB only.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface StorageSummary {
  user_email?: string;
  username?: string;
  total_gb: number;
  used_gb: number;
  remaining_gb: number;
  percentage_used: number;
}

export interface UploadQuotaCheck {
  can_upload: boolean;
  required_credits: number;
  available_credits: number;
  remaining_gb: number;
  message: string;
}

export interface BeginUploadResult {
  upload_id: string;
  credits_to_charge: number;
  message: string;
}

/**
 * Hook for managing storage and uploads
 */
export function useStorage() {
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch current storage summary for the user
   */
  const fetchStorageSummary = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const response = await fetch(`${supabaseUrl}/functions/v1/get-storage-summary`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch storage summary');
      }

      const data = await response.json();
      setStorageSummary(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Check if user can upload a file of given size
   */
  const checkUploadQuota = async (fileSizeBytes: number): Promise<UploadQuotaCheck | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const response = await fetch(`${supabaseUrl}/functions/v1/check-upload-quota`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_size_bytes: fileSizeBytes }),
      });

      if (!response.ok) {
        throw new Error('Failed to check upload quota');
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  /**
   * Begin an upload (creates pending upload record)
   */
  const beginUpload = async (fileSizeBytes: number): Promise<BeginUploadResult | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const response = await fetch(`${supabaseUrl}/functions/v1/begin-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_size_bytes: fileSizeBytes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to begin upload');
      }

      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  /**
   * Finalize upload after successful IPFS upload (deducts credits atomically)
   */
  const finalizeUpload = async (
    uploadId: string,
    ipfsCid: string,
    mediaShareId?: string
  ): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const response = await fetch(`${supabaseUrl}/functions/v1/finalize-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          upload_id: uploadId,
          ipfs_cid: ipfsCid,
          media_share_id: mediaShareId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to finalize upload');
      }

      await fetchStorageSummary();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  /**
   * Mark upload as failed (does NOT charge credits)
   */
  const failUpload = async (uploadId: string, errorMessage?: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const response = await fetch(`${supabaseUrl}/functions/v1/fail-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          upload_id: uploadId,
          error_message: errorMessage,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to mark upload as failed');
      }

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  /**
   * Add storage to user's account (after purchase)
   */
  const addStorage = async (gbToAdd: number): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const response = await fetch(`${supabaseUrl}/functions/v1/add-storage`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gb_to_add: gbToAdd }),
      });

      if (!response.ok) {
        throw new Error('Failed to add storage');
      }

      await fetchStorageSummary();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  /**
   * Format storage for display
   */
  const formatStorage = (summary: StorageSummary): string => {
    return `${summary.used_gb.toFixed(2)} GB / ${summary.total_gb.toFixed(2)} GB`;
  };

  /**
   * Get storage status color based on percentage
   */
  const getStorageStatusColor = (percentage: number): string => {
    if (percentage >= 90) return '#EF4444'; // Red
    if (percentage >= 70) return '#F59E0B'; // Orange
    return '#10B981'; // Green
  };

  useEffect(() => {
    fetchStorageSummary();
  }, []);

  return {
    storageSummary,
    loading,
    error,
    fetchStorageSummary,
    checkUploadQuota,
    beginUpload,
    finalizeUpload,
    failUpload,
    addStorage,
    formatStorage,
    getStorageStatusColor,
  };
}
