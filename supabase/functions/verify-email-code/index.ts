import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { userId, code, email } = await req.json();

    if (!userId || !code || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: verificationCode, error: fetchError } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("code", code)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !verificationCode) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired code" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { error: updateCodeError } = await supabase
      .from("verification_codes")
      .update({ verified: true })
      .eq("id", verificationCode.id);

    if (updateCodeError) {
      throw updateCodeError;
    }

    const { error: updateUserError } = await supabase
      .from("users")
      .update({ email_verified: true })
      .eq("id", userId);

    if (updateUserError) {
      throw updateUserError;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email verified successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Verification failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
