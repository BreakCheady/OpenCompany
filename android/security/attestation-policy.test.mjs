import assert from 'node:assert/strict';
import { evaluateVerifiedVerdict, EXPECTED_PACKAGE, REQUIRED_CERTIFICATE_SHA256 } from './attestation-policy.mjs';

const nonce = 'example-onetime-random-nonce-123456';
const nowMs = 1800000000000;
const verdict = {
  packageName: EXPECTED_PACKAGE,
  certificateSha256: REQUIRED_CERTIFICATE_SHA256,
  appRecognitionVerdict: 'PLAY_RECOGNIZED',
  deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY']
};
const payload = { verdict, nonce, expectedNonce: nonce, issuedAtMs: nowMs - 1000, nowMs, usedNonce: false };
const check = (mod, reason) => assert.equal(evaluateVerifiedVerdict({ ...payload, ...mod }).reason, reason);
assert.equal(REQUIRED_CERTIFICATE_SHA256.length, 64);
assert.equal(evaluateVerifiedVerdict(payload).allowed, true);
check({ verdict: null }, 'missing_verdict');
check({ nonce: 'wrong' }, 'challenge_mismatch');
check({ issuedAtMs: nowMs - 500000 }, 'expired_challenge');
check({ issuedAtMs: nowMs + 1 }, 'expired_challenge');
check({ usedNonce: true }, 'replayed_challenge');
check({ verdict: { ...verdict, packageName: 'example.fake' } }, 'package_mismatch');
check({ verdict: { ...verdict, certificateSha256: '0'.repeat(64) } }, 'certificate_mismatch');
check({ verdict: { ...verdict, appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }, 'unrecognized_app');
check({ verdict: { ...verdict, deviceRecognitionVerdict: [] } }, 'device_unverified');
console.log('Isolated attestation policy tests passed');
