import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!authHeader || !authHeader.includes(serviceKey || '')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Service role key required' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceKey ?? '',
    );

    const results = {
      stuck_uploads_fixed: 0,
      reservations_released: 0,
      expired_rate_limits_cleaned: 0,
      orphaned_thumbnails_checked: 0,
    };

    // 1. Find and fail stuck uploads (pending > 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: stuckUploads } = await supabase
      .from('uploads')
      .select('id, user_id, credits_required')
      .eq('status', 'pending')
      .lt('created_at', twoHoursAgo);

    if (stuckUploads && stuckUploads.length > 0) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'cleanup-job',
        action: 'fixing_stuck_uploads',
        count: stuckUploads.length,
      }));

      for (const upload of stuckUploads) {
        // Mark as failed
        await supabase
          .from('uploads')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', upload.id);

        // Release reserved credits
        if (upload.credits_required > 0) {
          await supabase.rpc('release_credits_for_failed_upload', {
            p_user_id: upload.user_id,
            p_upload_id: upload.id,
            p_credits_to_release: upload.credits_required,
          });
          results.reservations_released += upload.credits_required;
        }

        // Write to ledger for audit
        await supabase
          .from('storage_ledger')
          .insert({
            user_id: upload.user_id,
            ledger_type: 'charge_upload',
            credits_amount: 0,
            upload_id: upload.id,
            metadata: {
              status: 'failed',
              reason: 'cleanup_job_timeout',
              stuck_duration_hours: 2,
            },
          });

        results.stuck_uploads_fixed++;
      }
    }

    // 2. Clean up expired rate limit windows (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: deletedRateLimits } = await supabase
      .from('rate_limits')
      .delete()
      .lt('window_end', oneDayAgo);

    results.expired_rate_limits_cleaned = deletedRateLimits || 0;

    // 3. Find media_shares with pending thumbnail processing (> 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: pendingThumbnails } = await supabase
      .from('media_shares')
      .select('id, ipfs_cid')
      .in('processing_status', ['pending', 'processing'])
      .lt('created_at', oneHourAgo);

    if (pendingThumbnails && pendingThumbnails.length > 0) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'cleanup-job',
        action: 'found_stuck_thumbnails',
        count: pendingThumbnails.length,
      }));

      // Mark as failed (thumbnails can be regenerated manually)
      await supabase
        .from('media_shares')
        .update({ processing_status: 'failed' })
        .in('id', pendingThumbnails.map(t => t.id));

      results.orphaned_thumbnails_checked = pendingThumbnails.length;
    }

    // 4. Audit: Check for accounts with high reserved percentage
    const { data: highReservedAccounts } = await supabase
      .from('storage_account')
      .select('user_id, credits_balance, credits_reserved')
      .gt('credits_reserved', 0);

    if (highReservedAccounts) {
      const suspicious = highReservedAccounts.filter(
        (acc) => acc.credits_reserved / acc.credits_balance > 0.8
      );

      if (suspicious.length > 0) {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          service: 'cleanup-job',
          action: 'suspicious_reservations',
          count: suspicious.length,
          accounts: suspicious.map(a => ({ user_id: a.user_id, reserved_pct: (a.credits_reserved / a.credits_balance * 100).toFixed(1) })),
        }));
      }
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'cleanup-job',
      action: 'complete',
      results,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'cleanup-job',
      error: error.message,
      stack: error.stack,
    }));

    return new Response(
      JSON.stringify({
        error: 'Cleanup job failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
