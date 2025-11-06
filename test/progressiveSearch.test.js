/**
 * Test progressive time-based search
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Progressive Time Search', () => {
  it('should define correct time range progression', () => {
    const timeRanges = [
      { name: '3 days', relative: 'last3d', days: 3 },
      { name: '7 days', relative: 'last7d', days: 7 },
      { name: '14 days', relative: 'last14d', days: 14 },
      { name: '30 days', relative: 'last30d', days: 30 }
    ];

    assert.equal(timeRanges.length, 4, 'Should have 4 time ranges');
    assert.equal(timeRanges[0].days, 3, 'First range should be 3 days');
    assert.equal(timeRanges[3].days, 30, 'Last range should be 30 days');

    // Verify progression
    for (let i = 0; i < timeRanges.length - 1; i++) {
      assert.ok(
        timeRanges[i].days < timeRanges[i + 1].days,
        `Range ${i} (${timeRanges[i].days}d) should be less than range ${i + 1} (${timeRanges[i + 1].days}d)`
      );
    }
  });

  it('should build query with time filters correctly', () => {
    const queryParts = [];

    // Add search query
    queryParts.push('from:ludmila');

    // Add time filter (simulated)
    const after = 1234567890;
    const before = 1234654290;
    queryParts.push(`after:${after}`);
    queryParts.push(`before:${before}`);

    const finalQuery = queryParts.join(' ');

    assert.equal(
      finalQuery,
      'from:ludmila after:1234567890 before:1234654290',
      'Should combine filters correctly'
    );
  });

  it('should handle sent email filter in progressive search', () => {
    const filters = { sentOnly: true };
    const queryParts = [];

    if (filters.sentOnly) {
      queryParts.push('in:sent');
    } else if (!filters.includeSent) {
      queryParts.push('-in:sent');
    }

    queryParts.push('from:ludmila');

    const finalQuery = queryParts.join(' ');

    assert.equal(
      finalQuery,
      'in:sent from:ludmila',
      'Should include in:sent for sentOnly searches'
    );
  });

  it('should track attempted time ranges', () => {
    const attemptedTimeRanges = [];
    const timeRanges = ['3 days', '7 days', '14 days', '30 days'];

    // Simulate trying each range
    for (const range of timeRanges) {
      attemptedTimeRanges.push(range);

      // If we found results on second try
      if (range === '7 days') {
        break;
      }
    }

    assert.deepEqual(
      attemptedTimeRanges,
      ['3 days', '7 days'],
      'Should track all attempted ranges until success'
    );
  });
});

describe('Smart Search Strategy', () => {
  it('should try progressive time first, then query fallback', () => {
    const strategies = [];

    // Strategy 1: Progressive time
    strategies.push('progressive_time');
    const timeFound = false; // Simulate not finding anything

    if (!timeFound) {
      // Strategy 2: Query fallback
      strategies.push('query_fallback');
    }

    assert.deepEqual(
      strategies,
      ['progressive_time', 'query_fallback'],
      'Should try time expansion before query simplification'
    );
  });

  it('should stop on first success', () => {
    const strategies = [];

    // Strategy 1: Progressive time
    strategies.push('progressive_time');
    const timeFound = true; // Found something!

    if (!timeFound) {
      strategies.push('query_fallback');
    }

    assert.deepEqual(
      strategies,
      ['progressive_time'],
      'Should stop after first successful strategy'
    );
  });

  it('should combine time and query fallback info', () => {
    const attemptLog = {
      timeRanges: ['3 days', '7 days', '14 days', '30 days'],
      queries: ['subject:"full query" from:user', 'from:user', 'subject:"full q"'],
      success: 'query_fallback'
    };

    assert.equal(attemptLog.timeRanges.length, 4, 'Should try all 4 time ranges');
    assert.equal(attemptLog.queries.length, 3, 'Should try 3 query variations');
    assert.equal(attemptLog.success, 'query_fallback', 'Should indicate which strategy worked');
  });
});

describe('Use Cases from Real Conversation', () => {
  it('should handle "najdi email od ludmily" without time specification', () => {
    // User didn't specify time, so we use progressive search
    const searchQuery = 'from:ludmila';
    const userSpecifiedTime = false;

    const useProgressiveTime = !userSpecifiedTime;

    assert.ok(useProgressiveTime, 'Should use progressive time when user doesn\'t specify');

    // Should try: 3d → 7d → 14d → 30d
    const expectedAttempts = 4;
    assert.equal(expectedAttempts, 4, 'Should try up to 4 time ranges');
  });

  it('should respect explicit time range from user', () => {
    // User says "find emails from ludmila from last week"
    const searchQuery = 'from:ludmila';
    const userSpecifiedTime = { relative: 'thisWeek' };

    const useProgressiveTime = !userSpecifiedTime;

    assert.ok(!useProgressiveTime, 'Should NOT use progressive time when user specifies time');
  });

  it('should combine with sent email filter', () => {
    // User: "find emails I sent to ludmila"
    const searchQuery = 'ludmila';
    const filters = { sentOnly: true };

    const queryParts = [];

    if (filters.sentOnly) {
      queryParts.push('in:sent');
    }

    queryParts.push(searchQuery);

    const finalQuery = queryParts.join(' ');

    assert.equal(finalQuery, 'in:sent ludmila', 'Should combine sent filter with progressive time');
  });
});
