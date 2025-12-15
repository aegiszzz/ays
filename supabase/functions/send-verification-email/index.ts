import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    if (!email || !userId) {
      throw new Error('Email and userId are required');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !userData) {
      console.error('User check error:', userError);
      throw new Error('User not found. Please try again.');
    }

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
            subject: 'Doğrulama Kodunuz',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #333;">Doğrulama Kodunuz</h1>
                <p style="font-size: 16px; color: #666;">Hesabınızı doğrulamak için aşağıdaki kodu kullanın:</p>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #007AFF;">${code}</span>
                </div>
                <p style="font-size: 14px; color: #999;">Bu kod 10 dakika geçerlidir.</p>
              </div>
            `,
          }),
        });

        if (resendResponse.ok) {
          emailSent = true;
          console.log('Email sent successfully to:', email);
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