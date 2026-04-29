import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL')!,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  email: string;
  userId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email, userId }: RequestBody = await req.json();

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !email ||
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !userId ||
      typeof userId !== 'string' ||
      !UUID_RE.test(userId)
    ) {
      throw new Error('Invalid email or userId');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Per-IP rate limit (covers signup spam from same network)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    if (clientIp) {
      const { data: ipCheck } = await supabase.rpc('check_ip_rate_limit', {
        p_ip: clientIp,
        p_endpoint: 'send-verification-email',
      });
      if (ipCheck && !ipCheck.allowed) {
        return new Response(
          JSON.stringify({ error: ipCheck.message ?? 'Too many requests from your network' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: rateLimit } = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: 'send-verification-email',
    });
    if (rateLimit && !rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many verification emails requested. Please wait and try again.' }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const randomBytes = new Uint8Array(6);
    crypto.getRandomValues(randomBytes);
    const code = Array.from(randomBytes).map(b => (b % 10)).join('');

    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({
        user_id: userId,
        code,
        email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      throw new Error(`Failed to save verification code: ${insertError.message}`);
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    let emailSent = false;

    if (resendApiKey) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'AYS App <noreply@aysapp.xyz>',
            to: email,
            subject: 'Your Verification Code',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #333;">Your Verification Code</h1>
                <p style="font-size: 16px; color: #666;">Use the code below to verify your account:</p>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #007AFF;">${code}</span>
                </div>
                <p style="font-size: 14px; color: #999;">This code is valid for 10 minutes.</p>
              </div>
            `,
          }),
        });

        if (resendResponse.ok) {
          emailSent = true;
          const masked = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
          console.log('Email sent successfully to:', masked);
        } else {
          const errorText = await resendResponse.text();
          console.error('Resend email failed:', errorText);
        }
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    } else {
      console.log('No RESEND_API_KEY configured');
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailSent,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});