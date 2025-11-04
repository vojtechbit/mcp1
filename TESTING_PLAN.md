# Comprehensive Testing Plan pro OAuth Proxy Server

**Aplikace:** Gmail & Calendar OAuth Server
**Cíl:** Identifikovat a preventovat produkční selhání
**Datum:** 2025-11-04

---

## 📋 TESTING STRATEGY OVERVIEW

### Test Pyramid
```
              /\
             /  \      E2E Tests (10%)
            /    \     - OAuth flow end-to-end
           /------\    - Integration s Google APIs
          /        \
         /  INTEG   \  Integration Tests (30%)
        /   TESTS    \ - Service layer
       /--------------\- Database operations
      /                \
     /   UNIT TESTS     \ Unit Tests (60%)
    /____________________\ - Token encryption/decryption
                           - Error handling
                           - Utility functions
```

### Testing Focus Areas

1. **Token Lifecycle** (CRITICAL)
2. **Database Resilience** (HIGH)
3. **Google API Error Handling** (HIGH)
4. **OAuth Flow Security** (CRITICAL)
5. **Rate Limiting** (MEDIUM)
6. **Error Messaging** (LOW)

---

## 🧪 1. TOKEN LIFECYCLE TESTS

### 1.1 Token Expiry Detection

**File:** `test/tokenLifecycle/expiryDetection.test.js`

```javascript
import assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { getValidAccessToken } from '../src/services/googleApiService.js';

describe('Token Expiry Detection', () => {
  it('should detect token expiring within 5-minute buffer', async () => {
    const user = {
      googleSub: 'test123',
      accessToken: 'expired_token',
      refreshToken: 'refresh_123',
      tokenExpiry: new Date(Date.now() + 4 * 60 * 1000) // 4 minutes
    };

    // Mock database
    globalThis.__facadeMocks = {
      databaseService: {
        getUserByGoogleSub: async () => user
      }
    };

    // Should trigger refresh due to 5-min buffer
    const result = await getValidAccessToken('test123');

    assert.ok(result !== 'expired_token', 'Token should be refreshed');
  });

  it('should NOT refresh token expiring in 10 minutes', async () => {
    const user = {
      googleSub: 'test123',
      accessToken: 'valid_token',
      refreshToken: 'refresh_123',
      tokenExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    };

    globalThis.__facadeMocks = {
      databaseService: {
        getUserByGoogleSub: async () => user
      }
    };

    const result = await getValidAccessToken('test123');

    assert.strictEqual(result, 'valid_token', 'Token should not be refreshed');
  });
});
```

### 1.2 Concurrent Refresh Mutex

**File:** `test/tokenLifecycle/concurrentRefresh.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getValidAccessToken } from '../src/services/googleApiService.js';

describe('Concurrent Token Refresh', () => {
  it('should prevent thundering herd with mutex', async () => {
    let refreshCount = 0;

    const user = {
      googleSub: 'test123',
      accessToken: 'expired_token',
      refreshToken: 'refresh_123',
      tokenExpiry: new Date(Date.now() - 1000) // Already expired
    };

    globalThis.__facadeMocks = {
      databaseService: {
        getUserByGoogleSub: async () => user
      },
      oauth: {
        refreshAccessToken: async (refreshToken) => {
          refreshCount++;
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
          return {
            access_token: 'new_token',
            expires_in: 3600
          };
        }
      }
    };

    // Simulate 5 concurrent requests
    const promises = Array(5).fill(null).map(() =>
      getValidAccessToken('test123')
    );

    const results = await Promise.all(promises);

    // All should get same new token
    assert.ok(results.every(r => r === 'new_token'), 'All requests got new token');

    // But refresh should only happen ONCE (mutex protection)
    assert.strictEqual(refreshCount, 1, 'Refresh called only once due to mutex');
  });
});
```

### 1.3 Invalid Grant Handling

**File:** `test/tokenLifecycle/invalidGrant.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { refreshSingleUser } from '../src/services/backgroundRefreshService.js';

describe('Invalid Grant Error Handling', () => {
  it('should mark refresh_token_revoked on invalid_grant', async () => {
    let markedRevoked = false;

    const rawUserDoc = {
      google_sub: 'test123',
      email: 'test@example.com',
      encrypted_refresh_token: 'xxx',
      refresh_token_iv: 'yyy',
      refresh_token_auth_tag: 'zzz',
      refresh_token_revoked: false
    };

    globalThis.__facadeMocks = {
      databaseService: {
        getUserByGoogleSub: async () => ({
          googleSub: 'test123',
          refreshToken: 'invalid_refresh_token',
          tokenExpiry: new Date()
        })
      },
      oauth: {
        refreshAccessToken: async () => {
          const error = new Error('invalid_grant');
          error.response = { data: { error: 'invalid_grant' } };
          throw error;
        }
      },
      database: {
        collection: () => ({
          updateOne: async (filter, update) => {
            if (update.$set?.refresh_token_revoked === true) {
              markedRevoked = true;
            }
          }
        })
      }
    };

    const result = await refreshSingleUser(rawUserDoc);

    assert.strictEqual(result.status, 'failed', 'Refresh should fail');
    assert.strictEqual(result.errorCode, 'invalid_grant', 'Error code correct');
    assert.strictEqual(markedRevoked, true, 'Should mark token as revoked');
  });
});
```

### 1.4 Expiry Date Heuristic Edge Cases

**File:** `test/tokenLifecycle/expiryHeuristic.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';

function determineExpiryDate(newTokens) {
  if (newTokens.expiry_date) {
    return new Date(newTokens.expiry_date);
  }
  if (newTokens.expires_in) {
    return new Date(Date.now() + newTokens.expires_in * 1000);
  }
  return new Date(Date.now() + 3600 * 1000);
}

describe('Token Expiry Date Calculation', () => {
  it('should handle expiry_date in milliseconds', () => {
    const futureMs = Date.now() + 3600000; // 1 hour
    const result = determineExpiryDate({ expiry_date: futureMs });

    assert.ok(Math.abs(result.getTime() - futureMs) < 100, 'Should parse ms correctly');
  });

  it('should handle expires_in in seconds', () => {
    const now = Date.now();
    const result = determineExpiryDate({ expires_in: 3600 }); // 1 hour

    const expected = now + 3600000;
    assert.ok(Math.abs(result.getTime() - expected) < 100, 'Should parse seconds correctly');
  });

  it('should fallback to 1 hour when no expiry provided', () => {
    const now = Date.now();
    const result = determineExpiryDate({});

    const expected = now + 3600000;
    assert.ok(Math.abs(result.getTime() - expected) < 100, 'Should default to 1 hour');
  });

  it('should handle edge case: expires_in = 0', () => {
    const now = Date.now();
    const result = determineExpiryDate({ expires_in: 0 });

    // Should be "now" (already expired)
    assert.ok(Math.abs(result.getTime() - now) < 100, 'Should handle zero');
  });

  it('should handle edge case: negative expires_in', () => {
    const result = determineExpiryDate({ expires_in: -3600 });

    // Should be in past
    assert.ok(result.getTime() < Date.now(), 'Should handle negative');
  });
});
```

---

## 🗄️ 2. DATABASE RESILIENCE TESTS

### 2.1 Connection Failure Recovery

**File:** `test/database/connectionResilience.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { connectToDatabase } from '../src/config/database.js';

describe('Database Connection Resilience', () => {
  it('should retry connection with exponential backoff', async () => {
    let attemptCount = 0;
    const delays = [];

    globalThis.__facadeMocks = {
      mongodb: {
        MongoClient: class {
          connect() {
            attemptCount++;
            delays.push(Date.now());

            if (attemptCount < 3) {
              throw new Error('Connection timeout');
            }

            // Success on 3rd attempt
            return Promise.resolve();
          }
        }
      }
    };

    const db = await connectToDatabase();

    assert.strictEqual(attemptCount, 3, 'Should retry 3 times');

    // Check exponential backoff delays
    if (delays.length >= 3) {
      const delay1 = delays[1] - delays[0];
      const delay2 = delays[2] - delays[1];

      assert.ok(delay2 > delay1 * 1.5, 'Delays should increase exponentially');
    }
  });

  it('should reuse existing healthy connection', async () => {
    let connectCalls = 0;

    globalThis.__facadeMocks = {
      mongodb: {
        MongoClient: class {
          connect() {
            connectCalls++;
            return Promise.resolve();
          }
        }
      },
      database: {
        db: {
          admin: () => ({
            ping: async () => ({ ok: 1 }) // Healthy
          })
        }
      }
    };

    await connectToDatabase();
    await connectToDatabase(); // Second call

    assert.strictEqual(connectCalls, 1, 'Should reuse connection');
  });
});
```

### 2.2 Encryption/Decryption Integrity

**File:** `test/database/tokenEncryption.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { encryptToken, decryptToken } from '../src/services/tokenService.js';

describe('Token Encryption Integrity', () => {
  it('should encrypt and decrypt token correctly', () => {
    const original = 'ya29.a0AfH6SMBx...'; // Example access token

    const { encryptedToken, iv, authTag } = encryptToken(original);
    const decrypted = decryptToken(encryptedToken, iv, authTag);

    assert.strictEqual(decrypted, original, 'Decrypted should match original');
  });

  it('should fail decryption with wrong auth tag', () => {
    const original = 'test_token_123';

    const { encryptedToken, iv, authTag } = encryptToken(original);

    // Tamper with auth tag
    const wrongAuthTag = authTag.split('').reverse().join('');

    assert.throws(
      () => decryptToken(encryptedToken, iv, wrongAuthTag),
      /decryption failed/i,
      'Should throw on tampered auth tag'
    );
  });

  it('should generate unique IV for each encryption', () => {
    const token = 'same_token';

    const result1 = encryptToken(token);
    const result2 = encryptToken(token);

    assert.notStrictEqual(result1.iv, result2.iv, 'IVs should be unique');
    assert.notStrictEqual(result1.encryptedToken, result2.encryptedToken, 'Encrypted tokens should differ');
  });
});
```

---

## 🌐 3. GOOGLE API ERROR HANDLING TESTS

### 3.1 Rate Limit (429) Handling

**File:** `test/googleApi/rateLimitHandling.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { searchEmails } from '../src/services/googleApiService.js';

describe('Google API Rate Limit Handling', () => {
  it('should retry with exponential backoff on 429', async () => {
    let attemptCount = 0;
    const delays = [];

    globalThis.__facadeMocks = {
      gmailService: {
        users: {
          messages: {
            list: async () => {
              attemptCount++;
              delays.push(Date.now());

              if (attemptCount < 3) {
                const error = new Error('Rate limit exceeded');
                error.response = { status: 429 };
                throw error;
              }

              // Success on 3rd attempt
              return { data: { messages: [] } };
            }
          }
        }
      }
    };

    const result = await searchEmails('test123', { q: 'test' });

    assert.strictEqual(attemptCount, 3, 'Should retry on 429');
    assert.ok(result.messages, 'Should eventually succeed');
  });

  it('should propagate 429 error after max retries', async () => {
    let attemptCount = 0;

    globalThis.__facadeMocks = {
      gmailService: {
        users: {
          messages: {
            list: async () => {
              attemptCount++;
              const error = new Error('Rate limit exceeded');
              error.response = { status: 429 };
              throw error;
            }
          }
        }
      }
    };

    await assert.rejects(
      () => searchEmails('test123', { q: 'test' }),
      /rate limit/i,
      'Should throw after max retries'
    );

    assert.ok(attemptCount >= 3, 'Should attempt at least 3 times');
  });
});
```

### 3.2 Unauthorized (401) Auto-Refresh

**File:** `test/googleApi/autoRefresh401.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readEmail } from '../src/services/googleApiService.js';

describe('401 Unauthorized Auto-Refresh', () => {
  it('should refresh token and retry on 401', async () => {
    let getMessageAttempts = 0;
    let refreshCalled = false;

    globalThis.__facadeMocks = {
      gmailService: {
        users: {
          messages: {
            get: async () => {
              getMessageAttempts++;

              if (getMessageAttempts === 1) {
                // First attempt: 401
                const error = new Error('Invalid Credentials');
                error.code = 401;
                throw error;
              }

              // Second attempt: success (after refresh)
              return { data: { id: 'msg123', snippet: 'Test' } };
            }
          }
        }
      },
      oauth: {
        refreshAccessToken: async () => {
          refreshCalled = true;
          return {
            access_token: 'new_access_token',
            expires_in: 3600
          };
        }
      }
    };

    const result = await readEmail('test123', 'msg123');

    assert.strictEqual(getMessageAttempts, 2, 'Should retry after refresh');
    assert.strictEqual(refreshCalled, true, 'Should call refresh token');
    assert.strictEqual(result.id, 'msg123', 'Should return email data');
  });
});
```

### 3.3 Partial Response Handling

**File:** `test/googleApi/partialResponse.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readEmail } from '../src/services/googleApiService.js';

describe('Partial/Incomplete Response Handling', () => {
  it('should handle missing payload gracefully', async () => {
    globalThis.__facadeMocks = {
      gmailService: {
        users: {
          messages: {
            get: async () => ({
              data: {
                id: 'msg123',
                // Missing: payload, snippet, headers
              }
            })
          }
        }
      }
    };

    const result = await readEmail('test123', 'msg123');

    assert.strictEqual(result.id, 'msg123', 'Should return ID');
    // Should not throw, even with missing data
  });

  it('should handle malformed labelIds', async () => {
    globalThis.__facadeMocks = {
      gmailService: {
        users: {
          messages: {
            get: async () => ({
              data: {
                id: 'msg123',
                labelIds: null // Should be array
              }
            })
          }
        }
      }
    };

    // Should not throw
    const result = await readEmail('test123', 'msg123');
    assert.ok(result, 'Should handle null labelIds');
  });
});
```

---

## 🔐 4. OAUTH FLOW SECURITY TESTS

### 4.1 CSRF Protection (State Parameter)

**File:** `test/oauth/csrfProtection.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { handleCallback } from '../src/controllers/authController.js';

describe('OAuth CSRF Protection', () => {
  it('should reject callback with mismatched state', async () => {
    const req = {
      query: {
        code: 'auth_code_123',
        state: 'wrong_state'
      },
      session: {
        oauthState: 'correct_state' // Mismatch
      }
    };

    const res = {
      status: (code) => ({
        json: (data) => {
          assert.strictEqual(code, 403, 'Should return 403 Forbidden');
          assert.match(data.error, /csrf/i, 'Should mention CSRF');
        }
      })
    };

    await handleCallback(req, res);
  });

  it('should accept callback with matching state', async () => {
    const correctState = 'abc123def456';

    const req = {
      query: {
        code: 'auth_code_123',
        state: correctState
      },
      session: {
        oauthState: correctState // Match
      }
    };

    const res = {
      status: (code) => ({
        json: (data) => {
          assert.notStrictEqual(code, 403, 'Should not be forbidden');
        }
      })
    };

    globalThis.__facadeMocks = {
      oauth: {
        getTokensFromCode: async () => ({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600
        })
      }
    };

    await handleCallback(req, res);
  });
});
```

### 4.2 Auth Code Reuse Prevention

**File:** `test/oauth/authCodeReuse.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { exchangeAuthCode } from '../src/controllers/oauthProxyController.js';

describe('Auth Code Reuse Prevention', () => {
  it('should mark auth code as used after exchange', async () => {
    let codeMarkedUsed = false;

    globalThis.__facadeMocks = {
      database: {
        collection: (name) => {
          if (name === 'oauth_flows') {
            return {
              findOne: async ({ auth_code }) => ({
                auth_code,
                google_sub: 'test123',
                used: false,
                expires_at: new Date(Date.now() + 600000) // Valid
              }),
              updateOne: async (filter, update) => {
                if (update.$set?.used === true) {
                  codeMarkedUsed = true;
                }
              }
            };
          }
        }
      }
    };

    await exchangeAuthCode({ code: 'auth_code_123' });

    assert.strictEqual(codeMarkedUsed, true, 'Auth code should be marked used');
  });

  it('should reject already-used auth code', async () => {
    globalThis.__facadeMocks = {
      database: {
        collection: () => ({
          findOne: async () => ({
            auth_code: 'used_code',
            google_sub: 'test123',
            used: true, // Already used
            used_at: new Date()
          })
        })
      }
    };

    await assert.rejects(
      () => exchangeAuthCode({ code: 'used_code' }),
      /already.*used/i,
      'Should reject used code'
    );
  });
});
```

---

## ⏱️ 5. RATE LIMITING TESTS

### 5.1 Standard Rate Limiter

**File:** `test/rateLimit/standardLimiter.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest'; // Install: npm i -D supertest

describe('Rate Limiting Middleware', () => {
  it('should allow requests within limit', async () => {
    const app = express();

    // Apply rate limiter: max 10 requests per 15 min
    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
    app.use(limiter);

    app.get('/test', (req, res) => res.json({ ok: true }));

    // Send 10 requests
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/test');
      assert.strictEqual(res.status, 200, `Request ${i+1} should succeed`);
    }
  });

  it('should block requests exceeding limit', async () => {
    const app = express();

    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
    app.use(limiter);

    app.get('/test', (req, res) => res.json({ ok: true }));

    // Send 6 requests (1 over limit)
    let blockedCount = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app).get('/test');
      if (res.status === 429) blockedCount++;
    }

    assert.ok(blockedCount >= 1, 'At least 1 request should be blocked');
  });
});
```

---

## 📣 6. ERROR MESSAGING TESTS

### 6.1 Actionable Error Hints

**File:** `test/errorHandling/actionableHints.test.js`

```javascript
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { ApiError } from '../src/utils/errors.js';

describe('Error Actionable Hints', () => {
  it('should include retry suggestion for 429 errors', () => {
    const error = new ApiError('Rate limit exceeded', {
      statusCode: 429,
      code: 'GMAIL_RATE_LIMIT',
      actionable: {
        suggestedAction: 'retry_later',
        retryAfter: 300,
        hint: 'Gmail API rate limit. Please wait 5 minutes.'
      }
    });

    const response = error.toResponse();

    assert.strictEqual(response.actionable.suggestedAction, 'retry_later');
    assert.strictEqual(response.actionable.retryAfter, 300);
    assert.match(response.actionable.hint, /wait.*5 minutes/i);
  });

  it('should include re-auth hint for invalid_grant', () => {
    const error = new ApiError('Token revoked', {
      statusCode: 401,
      code: 'GOOGLE_UNAUTHORIZED',
      requiresReauth: true,
      actionable: {
        suggestedAction: 'reauth',
        hint: 'Your session expired. Please re-authenticate with Google.'
      }
    });

    const response = error.toResponse();

    assert.strictEqual(response.requiresReauth, true);
    assert.strictEqual(response.actionable.suggestedAction, 'reauth');
  });
});
```

---

## 🚀 EXECUTION PLAN

### Phase 1: Critical Tests (Week 1)
- [ ] Token Lifecycle Tests (1.1 - 1.4)
- [ ] OAuth Security Tests (4.1 - 4.2)
- [ ] Database Encryption Tests (2.2)

### Phase 2: Resilience Tests (Week 2)
- [ ] Database Connection Tests (2.1)
- [ ] Google API Error Handling (3.1 - 3.3)
- [ ] Rate Limiting Tests (5.1)

### Phase 3: Integration Tests (Week 3)
- [ ] End-to-End OAuth Flow
- [ ] Full Email Send/Receive Cycle
- [ ] Calendar Event CRUD Operations

### Phase 4: Load & Performance Tests (Week 4)
- [ ] 100 concurrent users simulation
- [ ] Background refresh with 1000 users
- [ ] Aggregate query stress test

---

## 📊 TEST COVERAGE GOALS

| Module | Current Coverage | Target | Priority |
|--------|------------------|--------|----------|
| `tokenService.js` | Unknown | 90% | 🔴 HIGH |
| `googleApiService.js` | Unknown | 80% | 🔴 HIGH |
| `databaseService.js` | Unknown | 85% | 🟠 MEDIUM |
| `backgroundRefreshService.js` | Unknown | 90% | 🔴 HIGH |
| `authController.js` | Unknown | 95% | 🔴 CRITICAL |
| `oauthProxyController.js` | Unknown | 95% | 🔴 CRITICAL |

---

## 🛠️ TESTING TOOLS

### Required
- `node:test` (built-in Node.js test runner)
- `node:assert` (assertions)
- `supertest` (HTTP testing)
- `nock` (HTTP mocking for Google APIs)

### Optional
- `c8` (code coverage)
- `faker` (test data generation)
- `chai` (BDD assertions)

### Install Commands
```bash
npm install --save-dev supertest nock c8 faker
```

---

## ✅ TEST EXECUTION

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
node --test test/tokenLifecycle/*.test.js
```

### Run with Coverage
```bash
npx c8 npm test
```

### Run in Watch Mode
```bash
node --test --watch
```

---

## 📝 TEST REPORTING

### Coverage Report Format
```bash
npx c8 --reporter=html --reporter=text npm test
```

### CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npx c8 --reporter=lcov npm test
      - uses: codecov/codecov-action@v3
```

---

## 🎯 SUCCESS CRITERIA

✅ **All critical tests passing**
✅ **90%+ code coverage on critical modules**
✅ **Zero flaky tests** (consistent pass/fail)
✅ **Test execution time < 2 minutes**
✅ **All security vulnerabilities covered**

---

## 📚 NEXT STEPS

1. **Implement test files** podle tohoto plánu
2. **Set up CI/CD** s automatickým testováním
3. **Monitor test coverage** trend (should increase over time)
4. **Add load tests** po dokončení unit/integration testů
5. **Document findings** v PRODUCTION_RISKS_ANALYSIS.md
