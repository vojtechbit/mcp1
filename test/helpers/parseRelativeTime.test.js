import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRelativeTime } from '../../src/utils/helpers.js';

describe('parseRelativeTime timezone boundaries', () => {
  it('returns full Prague day for yesterday after DST fallback', () => {
    const reference = new Date(Date.UTC(2024, 9, 28, 9, 0, 0)); // 2024-10-28 10:00 Prague (UTC+1)
    const { after, before } = parseRelativeTime('yesterday', reference);

    assert.equal(after, Date.UTC(2024, 9, 26, 22, 0, 0) / 1000, 'start of day should stay at UTC+2 midnight');
    assert.equal(before, Date.UTC(2024, 9, 27, 22, 59, 59) / 1000, 'end of day should account for 25h day');
  });

  it('returns shortened Prague day for today on DST spring forward', () => {
    const reference = new Date(Date.UTC(2024, 2, 31, 10, 0, 0)); // 2024-03-31 12:00 Prague (UTC+2 after shift)
    const { after, before } = parseRelativeTime('today', reference);

    assert.equal(after, Date.UTC(2024, 2, 30, 23, 0, 0) / 1000, 'start of day should reflect UTC+1 midnight');
    assert.equal(before, Date.UTC(2024, 2, 31, 21, 59, 59) / 1000, 'end of day should reflect 23h day');
  });
});
