/**
 * OpenCompany attestation policy — fail-closed, not wired to production.
 *
 * This module describes requirements for a future trusted verifier.
 * It deliberately refuses requests until a platform token was verified
 * by a trusted backend with Google's Play Integrity service (or an
 * explicitly reviewed equivalent).
 */
export const EXPECTED_PACKAGE = 'com.opencompany.game';
export const REQUIRED_CERTIFICATE_SHA256 =
  'E7AC03647B8E80F91C8556D3297DF8AAA09D0C66AC57C18483FACC A8 8759107A'.replace(/\s/g, '');
export const MAX_CHALLENGE_AGE_MS = 120_000;

export function evaluateVerifiedVerdict({ verdict, nonce, expectedNonce, issuedAtMs, nowMs, usedNonce }) {
  if (!verdict || typeof verdict !== 'object') return { allowed: false, reason: 'missing_verdict' };
  if (typeof nonce !== 'string' || nonce.length < 16 || nonce !== expectedNonce) return { allowed: false, reason: 'challenge_mismatch' };
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(nowMs) || issuedAtMs > nowMs ||
      nowMs - issuedAtMs > MAX_CHALLENGE_AGE_MS) return { allowed: false, reason: 'expired_challenge' };
  if (usedNonce) return { allowed: false, reason: 'replayed_challenge' };
  if (verdict.packageName !== EXPECTED_PACKAGE) return { allowed: false, reason: 'package_mismatch' };
  if (verdict.certificateSha256 !== REQUIRED_CERTIFICATE_SHA256) return { allowed: false, reason: 'certificate_mismatch' };
  if (verdict.appRecognitionVerdict !== 'PLAY_RECOGNIZED') return { allowed: false, reason: 'unrecognized_app' };
  if (!Array.isArray(verdict.deviceRecognitionVerdict) ||
      !verdict.deviceRecognitionVerdict.includes('MEETS_DEVICE_INTEGRITY')) return { allowed: false, reason: 'device_unverified' };
  return { allowed: true };
}

/**
 * Raw requests must never supply their own "verdict". The calling backend
 * must independently obtain/verify it from a trusted attestation provider.
 * Do not expose evaluateVerifiedVerdict directly as an API endpoint.
 */
