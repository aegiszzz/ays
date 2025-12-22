import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const CREDITS_PER_MB = 100;

// Error codes for standardized error handling
const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

function gbToCredits(gb: number): number {
  const mb = gb * 1024;
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

    const { gb_to_add, ledger_type = 'purchase_add_storage', reference, metadata } = await req.json();

    if (!gb_to_add || gb_to_add <= 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid storage amount',
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

    const credits_to_add = gbToCredits(gb_to_add);

    // Add credits using RPC (includes ledger write)
    const { data: result, error: rpcError } = await supabase.rpc('add_storage_credits', {
      p_user_id: user.id,
      p_credits_to_add: credits_to_add,
      p_ledger_type: ledger_type,
      p_reference: reference || null,
      p_metadata: metadata ? JSON.stringify({
        ...metadata,
        gb_added: gb_to_add,
      }) : JSON.stringify({ gb_added: gb_to_add }),
    });

    if (rpcError) {
      console.error('Error adding storage:', rpcError);
      return new Response(
        JSON.stringify({
          error: 'Failed to add storage',
          code: ErrorCodes.INTERNAL_ERROR,
          details: rpcError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: `Successfully added ${gb_to_add} GB to your storage`,
        gb_added: gb_to_add,
        credits_added: credits_to_add,
        new_balance: result.new_balance,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error adding storage:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to add storage',
        code: ErrorCodes.INTERNAL_ERROR
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});