import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const CREDITS_PER_MB = 100;

function bytesToCredits(bytes: number): number {
  const mb = bytes / (1024 * 1024);
  return Math.ceil(mb * CREDITS_PER_MB);
}

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

    const { file_size_bytes } = await req.json();

    if (!file_size_bytes || file_size_bytes <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid file size' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if user has sufficient storage
    const { data: account, error: accountError } = await supabase
      .from('storage_account')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Storage account not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const required_credits = bytesToCredits(file_size_bytes);
    
    if (account.credits_balance < required_credits) {
      return new Response(
        JSON.stringify({
          error: 'Storage limit reached. Upgrade to get more space.',
          can_upload: false,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create pending upload record
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .insert({
        user_id: user.id,
        file_size_bytes,
        credits_charged: required_credits,
        status: 'pending',
      })
      .select()
      .single();

    if (uploadError || !upload) {
      console.error('Error creating upload record:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to create upload record' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        upload_id: upload.id,
        credits_to_charge: required_credits,
        message: 'Upload initiated. Complete upload to finalize.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error beginning upload:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to begin upload' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});