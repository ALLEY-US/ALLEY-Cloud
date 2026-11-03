import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readDefaultKey(jsonVariable: string, ...legacyVariables: string[]): string {
  const raw = Deno.env.get(jsonVariable);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find((value) => typeof value === "string" && value.length > 0);
      if (first) return first;
    } catch {
      // Continue to legacy/single-key environment variables.
    }
  }
  for (const variable of legacyVariables) {
    const value = Deno.env.get(variable);
    if (value) return value;
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ success: false, error: "Sign in before redeeming a promo code." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = readDefaultKey(
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
    );
    const secretKey = readDefaultKey(
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    const fixedCode = (Deno.env.get("ALLEY_FIXED_PROMO_CODE") || "").trim();
    const ownerUserId = (Deno.env.get("ALLEY_OWNER_USER_ID") || "").trim();
    const ownerEmail = (Deno.env.get("ALLEY_OWNER_EMAIL") || "").trim().toLowerCase();

    if (!supabaseUrl || !publishableKey || !secretKey || !fixedCode || !ownerUserId || !ownerEmail) {
      console.error("Missing one or more required Supabase or ALLEY owner secrets.");
      return json({
        success: false,
        error: "The promo service is not fully configured. The owner must set ALLEY_FIXED_PROMO_CODE, ALLEY_OWNER_USER_ID, and ALLEY_OWNER_EMAIL, then redeploy this function.",
      }, 503);
    }
    if (!/^\d{6}-p$/i.test(fixedCode)) {
      console.error("ALLEY_FIXED_PROMO_CODE must match the format 123456-p.");
      return json({ success: false, error: "The server promo-code setting has an invalid format." }, 503);
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    const user = userData?.user;
    if (userError || !user) {
      return json({ success: false, error: "Your login session is invalid or expired. Sign in again." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const submittedCode = String(body?.code || "").trim();
    if (!/^\d{6}-p$/i.test(submittedCode)) {
      return json({ success: false, error: "Enter the promo code in the format 123456-p." }, 400);
    }

    const isOwner = user.id === ownerUserId && (user.email || "").toLowerCase() === ownerEmail;
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await adminClient.rpc("redeem_alley_fixed_promo", {
      p_user_id: user.id,
      p_code_valid: submittedCode.toLowerCase() === fixedCode.toLowerCase(),
      p_admin_access: isOwner,
    });

    if (error) {
      console.error("redeem_alley_fixed_promo RPC failed:", error.message);
      return json({
        success: false,
        error: "The promo database migration is missing or outdated. Apply the supplied permanent-promo SQL migration, then deploy this function again.",
      }, 500);
    }
    if (!data?.success) {
      return json({ success: false, error: data?.error || "The promo code was not accepted." }, 400);
    }

    return json({
      success: true,
      isOwner,
      permanent: true,
      message: isOwner
        ? "ALLEY Prime and all feature access are saved. Owner admin access is enabled for this approved account. The code does not rotate."
        : "ALLEY Prime and all feature access are saved to your account. The code does not rotate. Admin access remains owner-only.",
    });
  } catch (error) {
    console.error("Unexpected promo redemption error:", error);
    return json({ success: false, error: "An unexpected error occurred while redeeming the promo code." }, 500);
  }
});
