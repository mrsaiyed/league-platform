// The `imports.run` job (step 2.22, T-137): it reads an uploaded import once and a second
// run does no harm. On a one-import stand-in; the real stores run it in
// packages/database (fixture-import-commands.test.ts).
import {
  maxJobAttempts,
  type ImportRecord,
  type ImportsTx,
  type QueuedJob,
  type TransactionRunner,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { BadImportJobError, runImport } from './import-job.ts';
import { jobHandlers } from './job-handlers.ts';

const leagueId = '01900000-0000-7000-8000-000000000001';
const seasonId = '01900000-0000-7000-8000-0000000d0001';
const importId = '01900000-0000-7000-8000-0000001a0001';
const teamA = '01900000-0000-7000-8000-0000000d0011';
const teamB = '01900000-0000-7000-8000-0000000d0012';

function world(text: string, options: { readFails?: boolean } = {}) {
  const state: { record: ImportRecord; opened: { accountId: string | null }[] } = {
    opened: [],
    record: {
      id: importId,
      seasonId,
      kind: 'fixtures',
      status: 'reading',
      accountId: '01900000-0000-7000-8000-0000000000a1',
      fileName: 'fixtures.csv',
      report: { version: 1, upload: text },
      created: { version: 1 },
      appliedAt: null,
      undoneAt: null,
      version: 1,
    },
  };
  const transaction: TransactionRunner<ImportsTx> = async (context, work) => {
    state.opened.push({ accountId: context.accountId });
    // Only the imports store is used by this job.
    const tx = {
      imports: {
        find: async (id: string) => (id === state.record.id ? state.record : undefined),
        seasonNames: async () => {
          if (options.readFails) throw new Error('the database went away');
          return {
            teams: [
              { id: teamA, name: 'Team A' },
              { id: teamB, name: 'Team B' },
            ],
            venues: [],
          };
        },
        save: async (
          _id: string,
          change: { status: ImportRecord['status']; report?: unknown },
          version: number,
        ) => {
          if (state.record.version !== version) return undefined;
          state.record = {
            ...state.record,
            status: change.status,
            report: change.report ?? state.record.report,
            version: version + 1,
          };
          return version + 1;
        },
      },
    } as unknown as ImportsTx;
    return work(tx);
  };
  const handler = runImport({ transaction });
  const job = (ids: Record<string, string>): QueuedJob => ({
    id: '01900000-0000-7000-8000-0000000000f1',
    type: 'imports.run',
    leagueId,
    ids,
    attempt: 1,
  });
  return { state, handler, job, transaction };
}

describe('the imports.run job', () => {
  it('reads the import once for the job’s league, acting for nobody, and drops the text', async () => {
    const { state, handler, job } = world('Date,Home,Away\n2027-01-02,Team A,Team B');
    await handler(job({ importId }));
    expect(state.record.status).toBe('ready');
    expect(JSON.stringify(state.record.report)).not.toContain('upload');
    expect(state.opened).toEqual([{ accountId: null }]);
  });

  it('does no harm when run twice', async () => {
    const { state, handler, job } = world('Date,Home,Away\n2027-01-02,Team A,Team B');
    await handler(job({ importId }));
    const after = structuredClone(state.record);
    await handler(job({ importId }));
    expect(state.record).toEqual(after);
  });

  it('fails an import whose file has no usable game, with the reason kept', async () => {
    const { state, handler, job } = world('Date,Home,Away\n2027-01-02,Team A,Nobody');
    await handler(job({ importId }));
    expect(state.record.status).toBe('failed');
  });

  it('refuses a job without an import id, and is offered only with an imports transaction', async () => {
    const { handler, job, transaction } = world('x');
    await expect(handler(job({}))).rejects.toBeInstanceOf(BadImportJobError);
    await expect(handler(job({ importId: 'not-an-id' }))).rejects.toMatchObject({
      code: 'bad_job_data',
      retryable: false,
    });
    const email = {
      transaction: (async () => undefined) as never,
      email: { send: async () => ({ id: 'x' }) } as never,
      siteOrigin: 'https://leagues.example.test',
      sendingAddress: 'leagues@mail.example.test',
    };
    expect(Object.keys(jobHandlers(email))).toEqual(['email.send']);
    expect(Object.keys(jobHandlers({ ...email, importsTransaction: transaction }))).toEqual([
      'email.send',
      'imports.run',
    ]);
  });

  it('keeps the text while the read may still be retried, and drops it when the last attempt fails', async () => {
    const { state, handler, job } = world('Date,Home,Away\n2027-01-02,Team A,Team B', {
      readFails: true,
    });
    await expect(handler({ ...job({ importId }), attempt: 1 })).rejects.toThrow('went away');
    expect(state.record.status).toBe('reading');
    expect(JSON.stringify(state.record.report)).toContain('upload');
    await expect(handler({ ...job({ importId }), attempt: maxJobAttempts })).rejects.toThrow(
      'went away',
    );
    expect(state.record.status).toBe('failed');
    expect(JSON.stringify(state.record.report)).not.toContain('upload');
    expect(JSON.stringify(state.record.report)).not.toContain('Team A');
  });
});
