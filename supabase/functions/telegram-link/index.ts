// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME")?.replace(/^@/, "");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !botUsername) {
    return response({ error: "telegram_not_configured" }, 503);
  }
  if (!authorization) return response({ error: "not_authenticated" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();

  if (authError || !authData.user) return response({ error: "not_authenticated" }, 401);

  const { data: membership } = await userClient
    .from("company_members")
    .select("company_id, role, status")
    .eq("user_id", authData.user.id)
    .eq("role", "manager")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) return response({ error: "manager_membership_required" }, 403);

  const body = await request.json().catch(() => ({}));
  if (body.action === "disconnect") {
    const { error } = await adminClient
      .from("notification_connections")
      .update({
        external_chat_id: null,
        external_username: null,
        external_display_name: null,
        verification_code_hash: null,
        verification_expires_at: null,
        status: "disabled",
        verified_at: null
      })
      .eq("company_id", membership.company_id)
      .eq("user_id", authData.user.id)
      .eq("channel", "telegram");

    if (error) return response({ error: "telegram_disconnect_failed" }, 500);
    return response({ status: "disabled" });
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await adminClient.from("notification_connections").upsert({
    company_id: membership.company_id,
    user_id: authData.user.id,
    channel: "telegram",
    external_chat_id: null,
    external_username: null,
    external_display_name: null,
    verification_code_hash: tokenHash,
    verification_expires_at: expiresAt,
    status: "pending",
    verified_at: null
  }, { onConflict: "company_id,user_id,channel" });

  if (error) return response({ error: "telegram_link_failed" }, 500);

  return response({
    status: "pending",
    expiresAt,
    url: `https://t.me/${botUsername}?start=${token}`
  });
});
