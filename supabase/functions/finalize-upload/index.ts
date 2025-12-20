import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { upload_id, ipfs_cid, media_share_id } = await req.json();

    if (!upload_id) {
      return new Response(
        JSON.stringify({ error: 'Upload ID is required' }),
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
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the upload record
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', upload_id)
      .eq('user_id', user.id)
      .single();

    if (uploadError || !upload) {
      return new Response(
        JSON.stringify({ error: 'Upload not found' }),
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
        JSON.stringify({ error: 'Cannot finalize a failed upload' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ATOMIC TRANSACTION: Lock account row and deduct credits
    const { data: account, error: lockError } = await supabase
      .rpc('finalize_upload_transaction', {
        p_user_id: user.id,
        p_upload_id: upload_id,
        p_credits_to_charge: upload.credits_charged,
        p_ipfs_cid: ipfs_cid || null,
        p_media_share_id: media_share_id || null,
      });

    if (lockError) {
      console.error('Transaction error:', lockError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to finalize upload. Please try again.',
          details: lockError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: 'Upload finalized successfully',
        upload_id: upload.id,
        credits_charged: upload.credits_charged,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error finalizing upload:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to finalize upload' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});