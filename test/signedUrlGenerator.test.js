import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSignedAttachmentUrl, verifySignedUrl } from '../src/utils/signedUrlGenerator.js';

const MESSAGE_ID = 'test-message-id';
const ATTACHMENT_ID = 'test-attachment-id';

function parseSignedUrl(downloadUrl) {
  const url = new URL(downloadUrl);
  const expires = url.searchParams.get('expires');
  const signature = url.searchParams.get('signature');
  return { url, expires, signature };
}

test('generateSignedAttachmentUrl produces expected query params and expiration', () => {
  const customExpirationMs = 5 * 60 * 1000; // 5 minutes
  const beforeCall = Date.now();

  const { downloadUrl, expiresAt } = generateSignedAttachmentUrl(
    MESSAGE_ID,
    ATTACHMENT_ID,
    customExpirationMs
  );

  const { expires, signature } = parseSignedUrl(downloadUrl);

  assert.ok(expires, 'Signed URL should include expires parameter');
  assert.ok(signature, 'Signed URL should include signature parameter');

  const expiresSeconds = Number.parseInt(expires, 10);
  assert.ok(Number.isFinite(expiresSeconds), 'expires parameter should be numeric');

  const expectedExpirationSeconds = Math.floor((beforeCall + customExpirationMs) / 1000);
  // Allow a small tolerance for execution time between beforeCall and actual generation
  assert.ok(
    Math.abs(expiresSeconds - expectedExpirationSeconds) <= 1,
    `expires param (${expiresSeconds}) should be within 1 second of expected (${expectedExpirationSeconds})`
  );

  const isoExpiresSeconds = Math.floor(new Date(expiresAt).getTime() / 1000);
  assert.equal(
    isoExpiresSeconds,
    expiresSeconds,
    'ISO expiration timestamp should match expires query parameter'
  );
});

test('verifySignedUrl validates signature and expiration lifecycle', async (t) => {
  await t.test('returns valid before expiration with generated values', () => {
    const shortExpirationMs = 2 * 60 * 1000; // 2 minutes
    const { downloadUrl } = generateSignedAttachmentUrl(
      MESSAGE_ID,
      ATTACHMENT_ID,
      shortExpirationMs
    );

    const { expires, signature } = parseSignedUrl(downloadUrl);

    const verification = verifySignedUrl(MESSAGE_ID, ATTACHMENT_ID, expires, signature);
    assert.deepEqual(verification, { valid: true });
  });

  await t.test('reports URL_EXPIRED when current time exceeds expiration', () => {
    const { downloadUrl } = generateSignedAttachmentUrl(MESSAGE_ID, ATTACHMENT_ID, 1000);
    const { expires, signature } = parseSignedUrl(downloadUrl);

    const originalNow = Date.now;
    try {
      const afterExpirationMs = (Number.parseInt(expires, 10) + 5) * 1000;
      Date.now = () => afterExpirationMs;

      const verification = verifySignedUrl(MESSAGE_ID, ATTACHMENT_ID, expires, signature);
      assert.deepEqual(verification, {
        valid: false,
        error: 'URL has expired',
        code: 'URL_EXPIRED'
      });
    } finally {
      Date.now = originalNow;
    }
  });

  await t.test('reports INVALID_SIGNATURE when signature does not match', () => {
    const { downloadUrl } = generateSignedAttachmentUrl(MESSAGE_ID, ATTACHMENT_ID, 60 * 1000);
    const { expires, signature } = parseSignedUrl(downloadUrl);

    const tamperedSignature = `${signature.slice(0, -1)}${signature.slice(-1) === 'A' ? 'B' : 'A'}`;

    const verification = verifySignedUrl(MESSAGE_ID, ATTACHMENT_ID, expires, tamperedSignature);
    assert.deepEqual(verification, {
      valid: false,
      error: 'Invalid signature',
      code: 'INVALID_SIGNATURE'
    });
  });
});
