import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Credit to GB conversion
const CREDITS_PER_MB = 100;

// Error codes for standardized error handling
const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  STORAGE_ACCOUNT_NOT_FOUND: 'STORAGE_ACCOUNT_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

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
      .from('storage_account_with_email')
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

    const total_gb = creditsToGB(account.credits_total);
    const used_gb = creditsToGB(account.credits_spent);
    const remaining_gb = creditsToGB(account.credits_balance);
    const reserved_gb = creditsToGB(account.credits_reserved || 0);
    const available_gb = creditsToGB(account.credits_balance - (account.credits_reserved || 0));
    const percentage_used = account.credits_total > 0
      ? Math.round((account.credits_spent / account.credits_total) * 100)
      : 0;

    return new Response(
      JSON.stringify({
        user_email: account.email,
        username: account.username,
        total_gb,
        used_gb,
        remaining_gb,
        reserved_gb,
        available_gb,
        percentage_used,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error getting storage summary:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to get storage summary',
        code: ErrorCodes.INTERNAL_ERROR
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});