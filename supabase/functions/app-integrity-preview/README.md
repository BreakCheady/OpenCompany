# App integrity preview (inactive)

This is a fail-closed Supabase Edge Function scaffold. It accepts only POST
and responds with HTTP 503 and `gameAccessGranted: false`.

It does not validate genuine attestation tokens, accept caller-supplied
verdicts, mint sessions, read/write database records, or authorize gameplay.
It must not be used as a security gate until a full server-side integrity
verification and complete authorization design are implemented.

Deployment note (2026-10-18): the isolated Supabase staging project
`gqzydkqugwecuwkztfdr` returned INACTIVE. Deployment did not proceed.
The production Supabase project was not modified.

Before testing, restore or replace staging, deploy there, then verify:
- GET returns HTTP 405
- POST returns HTTP 503, with verified=false and gameAccessGranted=false
- POST of arbitrary client-supplied JSON cannot grant access
- No Supabase game permissions are changed
