import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { ethers } from "npm:ethers@6.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL")!,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// AES-256-GCM encryption — matches client-side decryptPrivateKey in wallet.ts
async function encryptPrivateKey(privateKey: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(userId),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(privateKey)
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { userId, code, email, username } = await req.json();

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !userId ||
      typeof userId !== "string" ||
      !UUID_RE.test(userId) ||
      !code ||
      typeof code !== "string" ||
      !/^\d{4,8}$/.test(code) ||
      !email ||
      typeof email !== "string" ||
      email.length > 254 ||
      (username !== undefined && (typeof username !== "string" || username.length > 50))
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid input" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: rateLimit } = await supabase.rpc("check_rate_limit", {
      p_user_id: userId,
      p_endpoint: "verify-email-code",
    });
    if (rateLimit && !rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many verification attempts. Please wait and try again." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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

    const wallet = ethers.Wallet.createRandom();
    const walletAddress = wallet.address;
    const encryptedPrivateKey = await encryptPrivateKey(wallet.privateKey, userId);

    const { error: insertUserError } = await supabase
      .from("users")
      .insert({
        id: userId,
        email: email,
        username: username || email.split("@")[0],
        wallet_address: walletAddress,
        encrypted_private_key: encryptedPrivateKey,
        email_verified: true,
        created_at: new Date().toISOString(),
      });

    if (insertUserError) {
      console.error("User insert error:", insertUserError);
      throw insertUserError;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email verified and account created successfully" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Verification error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Verification failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
