// What one group's failure means to the two-league test's standing check (step 2.224,
// T-294): scripts/fence-filter-check.mjs runs it on each failed group, and
// tests/fence-filter-check.test.mjs checks it on sample output.
//
// A group fails on `expect(failures, message).toEqual([])`, its message listing each
// failure on a line of its own that starts with a marker word the harness gives it
// (failureLines in packages/database/src/isolation/isolation-harness.test-helper.ts):
// LEAK when a case reached another league, UNCHECKED when it could not be run or
// compared, OTHER for the rest. Only a LEAK line counts as caught: a query that merely
// crashes once its filter is gone is not one the test caught.

const line = /^(LEAK|UNCHECKED|OTHER) (.*)$/gm;

/**
 * A failed group's verdict from its failure messages: 'caught' when an assertion failure
 * lists at least one LEAK line, otherwise 'error' with the reason (only UNCHECKED or
 * OTHER lines, no marked line at all, or a failure that is not the group's assertion).
 */
export function verdictOf(failureMessages) {
  const marked = [];
  for (const message of failureMessages) {
    if (!/^AssertionError\b/.test(message)) {
      return { verdict: 'error', reason: message.split('\n')[0] ?? 'no message' };
    }
    for (const [, marker, rest] of message.matchAll(line)) marked.push({ marker, rest });
  }
  if (marked.some(({ marker }) => marker === 'LEAK')) return { verdict: 'caught' };
  if (marked.length === 0) {
    return { verdict: 'error', reason: 'the assertion failed without listing a failure' };
  }
  const listed = [...new Set(marked.map(({ marker, rest }) => `${marker} ${rest}`))];
  return { verdict: 'error', reason: `no leak listed, only: ${listed.join('; ')}` };
}
