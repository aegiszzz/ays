import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Error codes for standardized error handling
const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  UPLOAD_NOT_FOUND: 'UPLOAD_NOT_FOUND',
  UPLOAD_ALREADY_FAILED: 'UPLOAD_ALREADY_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
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
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'Missing authorization header',
          code: ErrorCodes.UNAUTHORIZED
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const {
      upload_id,
      ipfs_cid,
      media_share_id,
      thumbnail_cid,
      preview_cid,
      video_poster_cid
    } = await req.json();

    if (!upload_id) {
      return new Response(
        JSON.stringify({
          error: 'Upload ID is required',
          code: ErrorCodes.INVALID_REQUEST
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Use service role for transaction to bypass RLS
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify user authentication
    const anonSupabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: authError } = await anonSupabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          code: ErrorCodes.UNAUTHORIZED
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the upload record and verify ownership
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', upload_id)
      .eq('user_id', user.id)
      .single();

    if (uploadError || !upload) {
      return new Response(
        JSON.stringify({
          error: 'Upload not found or access denied',
          code: ErrorCodes.UPLOAD_NOT_FOUND
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if already finalized
    if (upload.status === 'complete') {
      return new Response(
        JSON.stringify({ 
          message: 'Upload already finalized',
          upload_id: upload.id,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (upload.status === 'failed') {
      return new Response(
        JSON.stringify({
          error: 'Cannot finalize a failed upload',
          code: ErrorCodes.UPLOAD_ALREADY_FAILED
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ATOMIC TRANSACTION: Lock account row, deduct credits, write to ledger
    // Note: credits_to_charge parameter is ignored; function uses credits_required from upload
    const { data: account, error: lockError } = await supabase
      .rpc('finalize_upload_transaction', {
        p_user_id: user.id,
        p_upload_id: upload_id,
        p_credits_to_charge: upload.credits_required || upload.credits_charged,
        p_ipfs_cid: ipfs_cid || null,
        p_media_share_id: media_share_id || null,
      });

    if (lockError) {
      console.error('Transaction error:', lockError);
      return new Response(
        JSON.stringify({
          error: 'Failed to finalize upload',
          code: ErrorCodes.INTERNAL_ERROR,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update media_shares with thumbnail CIDs if provided
    if (media_share_id && (thumbnail_cid || preview_cid || video_poster_cid)) {
      const updateData: any = {};
      if (thumbnail_cid) updateData.thumbnail_cid = thumbnail_cid;
      if (preview_cid) updateData.preview_cid = preview_cid;
      if (video_poster_cid) updateData.video_poster_cid = video_poster_cid;
      if (Object.keys(updateData).length > 0) {
        updateData.processing_status = 'complete';
        await supabase
          .from('media_shares')
          .update(updateData)
          .eq('id', media_share_id);
      }
    }

    // Increment daily media usage counter
    if (upload.media_type) {
      const { error: usageError } = await supabase.rpc('increment_daily_media_usage', {
        p_user_id: user.id,
        p_media_type: upload.media_type,
      });

      if (usageError) {
        console.error('Failed to increment daily usage:', usageError);
      }
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'finalize-upload',
      user_id: user.id,
      upload_id: upload.id,
      credits_charged: account.credits_charged,
      has_thumbnail: !!thumbnail_cid,
      action: 'success',
    }));

    return new Response(
      JSON.stringify({
        success: true,
        upload_id: upload.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error finalizing upload:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to finalize upload',
        code: ErrorCodes.INTERNAL_ERROR
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});