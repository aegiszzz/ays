import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Credit calculation
const CREDITS_PER_MB = 100;

// Error codes for standardized error handling
const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  STORAGE_ACCOUNT_NOT_FOUND: 'STORAGE_ACCOUNT_NOT_FOUND',
  STORAGE_LIMIT_REACHED: 'STORAGE_LIMIT_REACHED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

function bytesToCredits(bytes: number): number {
  const mb = bytes / (1024 * 1024);
  return Math.ceil(mb * CREDITS_PER_MB);
}

function creditsToGB(credits: number): number {
  const mb = credits / CREDITS_PER_MB;
  const gb = mb / 1024;
  return Math.round(gb * 100) / 100;
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

    const { file_size_bytes } = await req.json();

    if (!file_size_bytes || file_size_bytes <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid file size',
          code: ErrorCodes.INVALID_REQUEST
        }),
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

    const { data: account, error: accountError } = await supabase
      .from('storage_account')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({
          error: 'Storage account not found',
          code: ErrorCodes.STORAGE_ACCOUNT_NOT_FOUND
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const required_credits = bytesToCredits(file_size_bytes);
    const can_upload = account.credits_balance >= required_credits;

    return new Response(
      JSON.stringify({
        can_upload,
        required_credits,
        available_credits: account.credits_balance,
        remaining_gb: creditsToGB(account.credits_balance),
        code: can_upload ? undefined : ErrorCodes.STORAGE_LIMIT_REACHED,
        message: can_upload
          ? 'Upload allowed'
          : 'Storage limit reached. Upgrade to get more space.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error checking upload quota:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to check upload quota',
        code: ErrorCodes.INTERNAL_ERROR
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});