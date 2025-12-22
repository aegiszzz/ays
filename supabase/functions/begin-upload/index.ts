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
  STORAGE_ACCOUNT_NOT_FOUND: 'STORAGE_ACCOUNT_NOT_FOUND',
  STORAGE_LIMIT_REACHED: 'STORAGE_LIMIT_REACHED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

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

    const { file_size_bytes, idempotency_key } = await req.json();

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

    // Check for existing upload with same idempotency key
    if (idempotency_key) {
      const { data: existingUpload } = await supabase
        .from('uploads')
        .select('*')
        .eq('user_id', user.id)
        .eq('idempotency_key', idempotency_key)
        .maybeSingle();

      if (existingUpload) {
        // Return existing upload (idempotent response)
        return new Response(
          JSON.stringify({
            upload_id: existingUpload.id,
            credits_to_charge: existingUpload.credits_required || existingUpload.credits_charged,
            message: 'Upload already initiated (idempotent response)',
            idempotent: true,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Check if user has sufficient storage
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

    if (account.credits_balance < required_credits) {
      return new Response(
        JSON.stringify({
          error: 'Storage limit reached. Upgrade to get more space.',
          code: ErrorCodes.STORAGE_LIMIT_REACHED,
          can_upload: false,
          required_credits,
          available_credits: account.credits_balance,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create pending upload record with credits_required
    const uploadData: any = {
      user_id: user.id,
      file_size_bytes,
      credits_required: required_credits,
      status: 'pending',
    };

    if (idempotency_key) {
      uploadData.idempotency_key = idempotency_key;
    }

    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .insert(uploadData)
      .select()
      .single();

    if (uploadError || !upload) {
      console.error('Error creating upload record:', uploadError);
      return new Response(
        JSON.stringify({
          error: 'Failed to create upload record',
          code: ErrorCodes.INTERNAL_ERROR
        }),
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
      JSON.stringify({
        error: error.message || 'Failed to begin upload',
        code: ErrorCodes.INTERNAL_ERROR
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});