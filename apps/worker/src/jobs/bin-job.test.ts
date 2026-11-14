// The `bin.empty` job (step 2.76, T-51, T-63): one league's step, run with the clock it
// is given. On a stand-in for the bin; the real stores run it against two leagues in
// packages/database (bin-commands.test.ts).
import type { BinCounts, BinTx, QueuedJob, TransactionRunner } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { runBinEmptying } from './bin-job.ts';
import { jobHandlers } from './job-handlers.ts';

const day = 24 * 60 * 60 * 1000;
const none: BinCounts = { courts: 0, venues: 0, teams: 0, divisions: 0, people: 0 };

function world() {
  const seen: { leagueId: string; accountId: string | null; cutoff: Date }[] = [];
  const activity: string[] = [];
  const transaction: TransactionRunner<BinTx> = async (context, work) => {
    const tx = {
      bin: {
        purge: async (cutoff: Date) => {
          seen.push({ leagueId: context.leagueId, accountId: context.accountId, cutoff });
          return { ...none, teams: 1 };
        },
      },
      activity: { record: async (entry: { action: string }) => void activity.push(entry.action) },
    } as unknown as BinTx;
    return work(tx);
  };
  const job = (leagueId: string): QueuedJob => ({
    id: '01900000-0000-7000-8000-0000000000f1',
    type: 'bin.empty',
    leagueId,
    ids: {},
    attempt: 1,
  });
  return { seen, activity, transaction, job };
}

describe('the bin.empty job', () => {
  it("runs in the job's own league, for nobody, 30 days before the clock", async () => {
    const { seen, activity, transaction, job } = world();
    const now = new Date('2026-06-30T12:00:00.000Z');
    const handler = runBinEmptying({ transaction, now: () => now });
    await handler(job('01900000-0000-7000-8000-000000000001'));
    await handler(job('01900000-0000-7000-8000-000000000002'));
    expect(seen).toEqual([
      {
        leagueId: '01900000-0000-7000-8000-000000000001',
        accountId: null,
        cutoff: new Date(now.getTime() - 30 * day),
      },
      {
        leagueId: '01900000-0000-7000-8000-000000000002',
        accountId: null,
        cutoff: new Date(now.getTime() - 30 * day),
      },
    ]);
    expect(activity).toEqual(['leagues.empty_bin', 'leagues.empty_bin']);
  });

  it('is offered only when the worker is given the bin', () => {
    const { transaction } = world();
    const base = {
      transaction: (async () => undefined) as never,
      email: { send: async () => undefined } as never,
      siteOrigin: 'https://example.test',
      sendingAddress: 'a@example.test',
    };
    expect(Object.keys(jobHandlers(base))).not.toContain('bin.empty');
    expect(
      Object.keys(jobHandlers({ ...base, bin: { transaction, now: () => new Date(0) } })),
    ).toContain('bin.empty');
  });
});
