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
    };

    // BETA SCOPE: Only cleanup stuck uploads
    // Advanced features (rate limits, thumbnails) not active in beta

    // Find and fail stuck uploads (pending > 2 hours)
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
