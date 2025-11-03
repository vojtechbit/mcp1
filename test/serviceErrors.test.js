import test from 'node:test';
import assert from 'node:assert/strict';

import { mapGoogleApiError } from '../src/services/serviceErrors.js';

test('mapGoogleApiError marks Google unauthorized errors as requiring reauth', () => {
  const error = new Error('Google request failed');
  error.response = {
    status: 401,
    data: {
      error: {
        status: 'UNAUTHORIZED'
      }
    }
  };

  const mapped = mapGoogleApiError(error);

  assert.equal(mapped.statusCode, 401);
  assert.equal(mapped.code, 'GOOGLE_UNAUTHORIZED');
  assert.equal(mapped.requiresReauth, true);
  assert.equal(mapped.expose, true);
});

test('mapGoogleApiError propagates explicit expose overrides', () => {
  const error = new Error('Google request failed');
  error.response = {
    status: 500,
    data: {
      error: {
        status: 'UNKNOWN'
      }
    }
  };

  const mapped = mapGoogleApiError(error, { expose: false, message: 'Custom message' });

  assert.equal(mapped.statusCode, 500);
  assert.equal(mapped.expose, false);
});
