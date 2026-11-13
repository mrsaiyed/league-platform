import { describe, expect, it } from 'vitest';
import { everyFileFinishedWell, isProgressReportTimeout } from './vitest.reporter';

describe('progress report timeouts', () => {
  it('recognizes only the onTaskUpdate timeout', () => {
    expect(
      isProgressReportTimeout(new Error('[vitest-worker]: Timeout calling "onTaskUpdate" with []')),
    ).toBe(true);
    expect(isProgressReportTimeout(new Error('something else'))).toBe(false);
    expect(isProgressReportTimeout(null)).toBe(false);
  });

  it('is ignored only when every file passed or was skipped', () => {
    expect(everyFileFinishedWell(['passed', 'skipped'], 'passed')).toBe(true);
    expect(everyFileFinishedWell(['passed', 'failed'], 'passed')).toBe(false);
    expect(everyFileFinishedWell(['passed', 'pending'], 'passed')).toBe(false);
    expect(everyFileFinishedWell([], 'passed')).toBe(false);
    expect(everyFileFinishedWell(['passed'], 'failed')).toBe(false);
    expect(everyFileFinishedWell(['passed'], 'interrupted')).toBe(false);
  });
});
