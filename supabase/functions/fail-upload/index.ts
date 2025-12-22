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

    const { upload_id, error_message } = await req.json();

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

    // Create authenticated client for auth check
    const anonSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
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

    // Use service role for ledger write
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get upload details before marking as failed
    const { data: existingUpload } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', upload_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingUpload) {
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

    // Mark upload as failed (NO credit deduction)
    const { data: upload, error: updateError } = await supabase
      .from('uploads')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', upload_id)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (updateError) {
      console.error('Error marking upload as failed:', updateError);
      return new Response(
        JSON.stringify({
          error: 'Failed to update upload status',
          code: ErrorCodes.INTERNAL_ERROR
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!upload) {
      return new Response(
        JSON.stringify({
          error: 'Upload not found or already processed',
          code: ErrorCodes.UPLOAD_NOT_FOUND
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Release reserved credits (atomic)
    const creditsToRelease = existingUpload.credits_required || 0;
    if (creditsToRelease > 0) {
      const { error: releaseError } = await supabase.rpc('release_credits_for_failed_upload', {
        p_user_id: user.id,
        p_upload_id: upload.id,
        p_credits_to_release: creditsToRelease,
      });

      if (releaseError) {
        console.error('Error releasing credits:', releaseError);
        // Don't fail the request, just log (upload is already marked failed)
      }
    }

    // Write to ledger for audit trail (failed uploads = 0 credits)
    // This helps track failed uploads for debugging and analytics
    await supabase
      .from('storage_ledger')
      .insert({
        user_id: user.id,
        ledger_type: 'charge_upload',
        credits_amount: 0,
        upload_id: upload.id,
        metadata: {
          status: 'failed',
          file_size_bytes: existingUpload.file_size_bytes,
          credits_released: creditsToRelease,
          error_message: error_message || 'Upload failed',
        },
      });

    return new Response(
      JSON.stringify({
        message: 'Upload marked as failed. No charges applied.',
        upload_id: upload.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error failing upload:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to mark upload as failed',
        code: ErrorCodes.INTERNAL_ERROR
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});