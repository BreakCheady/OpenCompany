// Isolated, fail-closed preview of a future Android app attestation endpoint.
// No game session, Supabase authorization, database calls, or privileged tokens.
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  // Deliberately no client-provided verdict acceptance. A real verifier must
  // decode and validate Google's signed attestation response on the server,
  // and bind it to a one-use challenge and authenticated identity.
  return json({
    verified: false,
    gameAccessGranted: false,
    code: "attestation_not_configured",
    message: "Android app attestation is not enabled.",
  }, 503);
});
