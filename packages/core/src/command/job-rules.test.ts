// What a job may hold (T-131), the same rules as the jobs table (0006).
import { describe, expect, it } from 'vitest';
import { isIsoDate, jobProblem, jobTypes, maxJobDelaySeconds } from './job-rules.ts';

const id = '0190abcd-0000-7000-8000-00000000000f';
const other = '0190abcd-0000-7000-8000-0000000000aa';
const job = (extra: Partial<Parameters<typeof jobProblem>[0]> = {}) => ({
  type: 'email.send',
  ids: { invitationId: id },
  ...extra,
});

describe('jobProblem', () => {
  it('accepts every job type, ids, dates under date names, a delay and a dedupe key', () => {
    for (const type of jobTypes) expect(jobProblem(job({ type }))).toBeNull();
    expect(jobProblem(job({ ids: {} }))).toBeNull();
    expect(
      jobProblem(
        job({
          ids: { accountId: id, gameDay: '2026-11-14', startsOn: '2028-02-29' },
          delaySeconds: 600,
          dedupeKey: `${id}:${other}:2026-11-14`,
        }),
      ),
    ).toBeNull();
    expect(jobProblem(job({ delaySeconds: maxJobDelaySeconds }))).toBeNull();
  });

  it('refuses content, saying why without repeating it', () => {
    const cases: [Parameters<typeof jobProblem>[0], string][] = [
      [job({ type: 'john.smith' }), 'type'],
      [job({ type: 'Send email' }), 'type'],
      [job({ ids: { to: 'someone@example.test' } }), 'T-131'],
      [job({ ids: { name: 'Made Up' } }), 'T-131'],
      [job({ ids: { invitationId: id.toUpperCase() } }), 'T-131'],
      [job({ ids: { invitationId: '2026-11-14' } }), 'T-131'],
      [job({ ids: { gameDay: id } }), 'date'],
      [job({ ids: { gameDay: '2026-02-30' } }), 'date'],
      [job({ ids: { gameDay: '555-123-4567' } }), 'date'],
      [job({ ids: { Invitation_id: id } }), 'camelCase'],
      [job({ ids: Object.fromEntries([...Array(11).keys()].map((k) => [`id${k}`, id])) }), '10'],
      [job({ delaySeconds: -1 }), 'delay'],
      [job({ delaySeconds: 1.5 }), 'delay'],
      [job({ delaySeconds: maxJobDelaySeconds + 1 }), 'delay'],
      [job({ dedupeKey: 'someone@example.test' }), 'dedupe key'],
      [job({ dedupeKey: 'john.smith' }), 'dedupe key'],
      [job({ dedupeKey: 'Made-Up' }), 'dedupe key'],
      [job({ dedupeKey: '555-123-4567' }), 'dedupe key'],
      [job({ dedupeKey: `invitation:${id}` }), 'dedupe key'],
      [job({ dedupeKey: `${id}:` }), 'dedupe key'],
      [job({ dedupeKey: '' }), 'dedupe key'],
      [job({ dedupeKey: Array(11).fill(id).join(':') }), 'dedupe key'],
    ];
    for (const [given, reason] of cases) {
      const problem = jobProblem(given);
      expect({ given, problem }).toEqual({ given, problem: expect.stringContaining(reason) });
      expect(problem).not.toMatch(/example\.test|Made Up|john|555/);
    }
  });

  it('refuses ids that are not a plain object, whatever the types say', () => {
    for (const ids of [null, [id], 'text']) {
      const notAnObject = ids as unknown as Record<string, string>;
      expect(jobProblem({ type: 'email.send', ids: notAnObject })).toBe(
        'its ids are not an object',
      );
    }
  });
});

describe('isIsoDate', () => {
  it('accepts real dates only', () => {
    for (const day of ['2026-11-14', '2028-02-29', '0001-01-01']) expect(isIsoDate(day)).toBe(true);
    for (const day of ['2026-02-29', '2026-13-01', '2026-00-10', '0000-01-01', '2026-1-01', 'x']) {
      expect({ day, ok: isIsoDate(day) }).toEqual({ day, ok: false });
    }
  });
});
