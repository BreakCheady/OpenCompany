# Isolated Android security test infrastructure

Staging project: `htykwmeavqhmukgvkuho` (OpenCompany-Security-Test).
Production project: `vprlmimcppdurywmgqat` — do not apply staging setup to production.

## Deployed
- `app_security.challenges`: hashes of random challenges, user binding, two-minute expiry, single-use consumed marker, RLS and restricted schema privileges.
- `public.issue_test_challenge(uuid,text)` and `public.consume_test_challenge(uuid,text)`: service_role-only execution. The issuance RPC uses a per-user transaction advisory lock before checking the limit of five requests per minute, avoiding concurrent bypasses.
- `public.cleanup_expired_test_challenges()`: service_role-only cleanup of old entries, callable but not scheduled.
- `app-challenge-test`: Edge Function with JWT verification enabled; independently resolves user identity via Supabase Auth; issues random 32-byte challenge, storing SHA-256 only. Never grants game access.
- `app-integrity-preview`: explicit fail-closed Edge Function with 503 response.

## Verification and exclusions
- SQL rollback test: `android/security/staging-challenge-tests.sql`.
- First challenge consumption succeeds and replay is rejected.
- Access to issue/consume and cleanup RPCs is not available directly to `anon` or `authenticated` roles.
- No staging gameplay database and no authenticated HTTP end-to-end tests yet.
- Play Integrity requires Google Play Console / Google Cloud integration and real device tests. No platform verdict has been verified.
- An app-issued JWT or caller-submitted `verdict` must never be trusted as integrity evidence.
- A TWA accessing a public origin cannot become app-exclusive merely by modifying UI routes.
- No production access policies, game URLs or app entrypoints have been restricted.

## Before any production gate
1. Integrate Play Integrity (or a separately assessed equivalent for sideloaded releases), including secure server-side token validation.
2. Verify the actual distribution's signing certificate and app recognition verdict; note Play app signing may differ.
3. Implement device-bound challenge requests and one-time replay-resistant session issuance.
4. Protect all game tables, SECURITY DEFINER RPCs, storage, Edge Functions and realtime paths on the server.
5. Execute positive device tests and negative browser/API tests; retain a rollback procedure.
