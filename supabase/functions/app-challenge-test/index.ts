// Test-only challenge issuer. No game access token or attestation verdict is issued.
// Must only be deployed to the isolated OpenCompany-Security-Test project.
import { createClient } from "jsr:@supabase/supabase-js@2";

const send = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const PROJECT_REF = "htykwmeavqhmukgvkuho";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return send({ error: "method_not_allowed" }, 405);
  const baseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (new URL(baseUrl).hostname !== PROJECT_REF + ".supabase.co" || !serviceKey) {
    return send({ error: "staging_only" }, 503);
  }
  const header = request.headers.get("Authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._~-]+$/.test(header)) return send({ error: "unauthorized" }, 401);
  const jwt = header.slice(7);
  const client = createClient(baseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: auth, error: authError } = await client.auth.getUser(jwt);
  if (authError || !auth.user?.id) return send({ error: "unauthorized" }, 401);

  const random = crypto.getRandomValues(new Uint8Array(32));
  const nonce = Array.from(random, x => x.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const nonceHash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
  const { error } = await client.rpc("issue_test_challenge", {
    p_user_id: auth.user.id,
    p_nonce_hash: nonceHash
  });
  if (error) return send({ error: error.message?.includes("rate_limited") ? "rate_limited" : "challenge_unavailable" }, error.message?.includes("rate_limited") ? 429 : 503);
  return send({ nonce, expiresInSeconds: 120, gameAccessGranted: false });
});
