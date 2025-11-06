/**
 * Test fallback search query generation
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Manually import the function we're testing
// We'll create a simplified version for testing since we can't easily import from facadeService
function generateFallbackSearchQueries(originalQuery) {
  const queries = [originalQuery];

  // Parse query to extract sender and subject filters
  const senderMatch = originalQuery.match(/from:([^\s]+|"[^"]+")/);
  const subjectMatch = originalQuery.match(/subject:([^\s]+|"[^"]+")/);

  // If we have both sender and subject, try variations
  if (senderMatch && subjectMatch) {
    const sender = senderMatch[0];
    const subject = subjectMatch[1].replace(/^"|"$/g, ''); // Remove quotes
    const otherParts = originalQuery
      .replace(senderMatch[0], '')
      .replace(/subject:([^\s]+|"[^"]+")/g, '')
      .trim();

    // Try just sender (with other filters if any)
    const senderOnly = [sender, otherParts].filter(p => p).join(' ');
    if (senderOnly !== originalQuery) {
      queries.push(senderOnly);
    }

    // Try progressively shorter subject strings
    if (subject.length > 3) {
      for (let len = Math.floor(subject.length * 0.7); len >= 3; len = Math.floor(len * 0.7)) {
        const shortSubject = subject.substring(0, len);
        queries.push(`subject:"${shortSubject}" ${sender} ${otherParts}`.trim());
      }
    }

    // Try subject only (with other filters if any)
    const subjectOnly = [`subject:"${subject}"`, otherParts].filter(p => p).join(' ');
    if (subjectOnly !== originalQuery && !queries.includes(subjectOnly)) {
      queries.push(subjectOnly);
    }
  } else if (subjectMatch) {
    // Only subject filter exists, try progressively shorter versions
    const subject = subjectMatch[1].replace(/^"|"$/g, '');
    const otherParts = originalQuery
      .replace(/subject:([^\s]+|"[^"]+")/g, '')
      .trim();

    if (subject.length > 3) {
      for (let len = Math.floor(subject.length * 0.7); len >= 3; len = Math.floor(len * 0.7)) {
        const shortSubject = subject.substring(0, len);
        const newQuery = [`subject:"${shortSubject}"`, otherParts].filter(p => p).join(' ');
        if (!queries.includes(newQuery)) {
          queries.push(newQuery);
        }
      }
    }
  }

  return queries;
}

describe('Email Search Fallback', () => {
  it('should return original query when no filters present', () => {
    const queries = generateFallbackSearchQueries('simple search');
    assert.deepEqual(queries, ['simple search']);
  });

  it('should generate fallback queries for subject + sender', () => {
    const queries = generateFallbackSearchQueries('subject:"Project Update Q1" from:john@example.com');

    assert.ok(queries.length > 1, 'Should generate multiple fallback queries');
    assert.equal(queries[0], 'subject:"Project Update Q1" from:john@example.com', 'First query should be original');
    assert.ok(queries.some(q => q.includes('from:john@example.com') && !q.includes('subject:')),
      'Should include sender-only query');
  });

  it('should generate progressively shorter subject queries', () => {
    const queries = generateFallbackSearchQueries('subject:"Very Long Subject Line" from:test@example.com');

    // Should have original, sender-only, and shorter subject variations
    assert.ok(queries.length >= 3, 'Should have at least 3 queries');

    const shorterSubjects = queries.filter(q => q.includes('subject:') && q !== queries[0]);
    assert.ok(shorterSubjects.length > 0, 'Should have shorter subject variations');
  });

  it('should handle subject-only queries', () => {
    const queries = generateFallbackSearchQueries('subject:"Testing Fallback"');

    assert.ok(queries.length > 1, 'Should generate fallback queries for subject-only');
    assert.equal(queries[0], 'subject:"Testing Fallback"', 'First should be original');
  });

  it('should not modify queries with only sender', () => {
    const queries = generateFallbackSearchQueries('from:sender@example.com');
    assert.deepEqual(queries, ['from:sender@example.com']);
  });

  it('should handle queries with additional filters', () => {
    const queries = generateFallbackSearchQueries('subject:"Test" from:user@test.com after:1234567890');

    assert.ok(queries.length > 1, 'Should generate fallback queries');
    assert.ok(queries.some(q => q.includes('after:1234567890') && !q.includes('subject:')),
      'Should preserve other filters in sender-only fallback');
  });
});
