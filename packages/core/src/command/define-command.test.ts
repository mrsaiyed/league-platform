// The command shape (T-23, T-24, T-74, T-196) on a stand-in database.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { commandRegistry } from './command-registry.ts';
import { defineCommand } from './define-command.ts';
import { onEvent } from './on-event.ts';
import type { CommandContext, CommandTx, DomainEvent } from './ports.ts';
import { fail, ok, type Result } from './result.ts';
import { memoryDatabase, memoryTransaction, testDeps } from './testing/memory-transaction.ts';

type State = { ownerId: string; notes: string[]; audit: string[] };
type NotesTx = CommandTx & { state: State };
type NoteAdded = { type: 'notes.added'; leagueId: string; count: number };

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner: CommandContext = { leagueId, accountId: 'owner', requestId: 'request-1' };

const addNote = defineCommand({
  name: 'notes.add_note',
  input: z.object({ text: z.string().min(1).max(20), failAfterSaving: z.boolean().default(false) }),
  allowed: async (context, _input, tx: NotesTx) => context.accountId === tx.state.ownerId,
  run: async ({ context, input, tx, emit }): Promise<Result<number, { code: 'too-many' }>> => {
    tx.state.notes.push(input.text);
    await tx.jobs.enqueue({ type: 'notify.event', leagueId, ids: { leagueId } });
    if (input.failAfterSaving) return fail({ code: 'too-many' });
    if (input.text === 'explode') throw new Error('unexpected');
    if (input.text === 'elsewhere') emit({ type: 'notes.added', leagueId: 'another' });
    if (input.text === 'misfiled') {
      await tx.jobs.enqueue({ type: 'notify.event', leagueId: 'another', ids: {} });
    }
    if (input.text === 'personal') {
      await tx.jobs.enqueue({ type: 'notify.event', leagueId, ids: { to: 'a@example.test' } });
    }
    emit({ type: 'notes.added', leagueId: context.leagueId, count: tx.state.notes.length });
    return ok(tx.state.notes.length);
  },
});

const audit = onEvent<NoteAdded, NotesTx>('notes.added', async (event, tx) => {
  tx.state.audit.push(`note ${event.count}`);
});

function setUp() {
  const db = memoryDatabase<State>({ ownerId: 'owner', notes: [], audit: [] });
  const transaction = memoryTransaction(db, (state, jobs): NotesTx => ({ state, jobs }));
  return { db, deps: testDeps(transaction, [audit]) };
}

describe('defineCommand', () => {
  it('saves, records its jobs and handles its events in one transaction', async () => {
    const { db, deps } = setUp();
    expect(await addNote(owner, { text: 'hello' }, deps)).toEqual({ ok: true, value: 1 });
    expect(db.state).toEqual({ ownerId: 'owner', notes: ['hello'], audit: ['note 1'] });
    expect(db.jobs).toEqual([{ type: 'notify.event', leagueId, ids: { leagueId } }]);
    expect(db.opened).toEqual([owner]);
  });

  it('checks the input before anything else, naming where but not the value', async () => {
    const { db, deps } = setUp();
    const result = await addNote(owner, { text: 'far too long for a note' }, deps);
    expect(result).toEqual({
      ok: false,
      error: { code: 'invalid-input', issues: [{ path: 'text', problem: 'too_big' }] },
    });
    expect(JSON.stringify(result)).not.toContain('far too long');
    expect(db.opened).toEqual([]);
  });

  it('refuses an account the policy does not allow, changing nothing (T-74)', async () => {
    const { db, deps } = setUp();
    const stranger = { ...owner, accountId: 'stranger' };
    expect(await addNote(stranger, { text: 'hello' }, deps)).toEqual({
      ok: false,
      error: { code: 'not-allowed' },
    });
    expect(await addNote({ ...owner, accountId: null }, { text: 'hello' }, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.notes).toEqual([]);
  });

  it('rolls back what it saved, jobs too, when it returns an expected error', async () => {
    const { db, deps } = setUp();
    const result = await addNote(owner, { text: 'hello', failAfterSaving: true }, deps);
    expect(result).toEqual({ ok: false, error: { code: 'too-many' } });
    expect(db.state.notes).toEqual([]);
    expect(db.jobs).toEqual([]);
  });

  it('throws an unexpected failure on, after rolling back', async () => {
    const { db, deps } = setUp();
    await expect(addNote(owner, { text: 'explode' }, deps)).rejects.toThrow('unexpected');
    await expect(addNote(owner, { text: 'elsewhere' }, deps)).rejects.toThrow(
      'notes.add_note announced notes.added for another league.',
    );
    expect(db.state.notes).toEqual([]);
    expect(db.jobs).toEqual([]);
  });

  it('logs every call once: name, league, account, request, time, outcome (T-196)', async () => {
    const { deps } = setUp();
    await addNote(owner, { text: 'secret words' }, deps);
    await addNote({ ...owner, accountId: 'stranger' }, { text: 'secret words' }, deps);
    await addNote(owner, { text: 'explode' }, deps).catch(() => undefined);
    const base = { command: 'notes.add_note', requestId: 'request-1', leagueId, durationMs: 5 };
    expect(deps.lines).toEqual([
      { ...base, accountId: 'owner', outcome: 'ok' },
      { ...base, accountId: 'stranger', outcome: 'refused', errorCode: 'not-allowed' },
      { ...base, accountId: 'owner', outcome: 'failed' },
    ]);
    expect(JSON.stringify(deps.lines)).not.toContain('secret');
  });

  it('is named for the command, and refuses a name not like module.action', () => {
    expect(addNote.name).toBe('notes.add_note');
    expect(addNote.commandName).toBe('notes.add_note');
    const named = (name: string) => () =>
      defineCommand({
        name,
        input: z.object({}),
        allowed: async () => true,
        run: async (): Promise<Result<null, never>> => ok(null),
      });
    expect(named('AddNote')).toThrow('is not a command name');
    expect(named('add_note')).toThrow('is not a command name');
  });

  it('refuses a job for another league, whoever records it', async () => {
    const { db, deps } = setUp();
    await expect(addNote(owner, { text: 'misfiled' }, deps)).rejects.toThrow(
      'notes.add_note recorded the job notify.event for another league.',
    );
    expect(db.jobs).toEqual([]);
  });

  it('refuses a job carrying anything but ids, without repeating it (T-131)', async () => {
    const { db, deps } = setUp();
    const failure = addNote(owner, { text: 'personal' }, deps);
    await expect(failure).rejects.toThrow(
      'notes.add_note recorded a job that it carries something other than a lower-case UUID',
    );
    await expect(failure).rejects.not.toThrow('example.test');
    expect(db.jobs).toEqual([]);
  });

  it('reads ids in lower case, as the database does, in the policy and the log', async () => {
    const { db, deps } = setUp();
    db.state.ownerId = 'owner';
    const shouting = { leagueId: leagueId.toUpperCase(), accountId: 'OWNER', requestId: 'r' };
    expect(await addNote(shouting, { text: 'hello' }, deps)).toEqual({ ok: true, value: 1 });
    expect(db.opened).toEqual([{ leagueId, accountId: 'owner', requestId: 'r' }]);
    expect(deps.lines[0]).toMatchObject({ leagueId, accountId: 'owner' });
  });

  it('a failing log or clock never changes the outcome', async () => {
    const { db, deps } = setUp();
    const broken = {
      ...deps,
      log: () => {
        throw new Error('log is down');
      },
      now: () => {
        throw new Error('clock is down');
      },
    };
    expect(await addNote(owner, { text: 'hello' }, broken)).toEqual({ ok: true, value: 1 });
    expect(db.state.notes).toEqual(['hello']);
    await expect(addNote(owner, { text: 'explode' }, broken)).rejects.toThrow('unexpected');
    const noClock = { ...deps, now: () => Number.NaN };
    await addNote(owner, { text: 'again' }, noClock);
    expect(deps.lines.at(-1)).toMatchObject({ outcome: 'ok', durationMs: null });
  });

  it('a handler is given only events of its type', async () => {
    const tx: NotesTx = {
      state: { ownerId: '', notes: [], audit: [] },
      jobs: { enqueue: async () => {} },
    };
    const other: DomainEvent = { type: 'notes.removed', leagueId };
    await expect(audit.handle(other, tx)).rejects.toThrow('was given notes.removed');
  });
});

describe('commandRegistry', () => {
  it('finds each command by its name, and refuses two with one name', () => {
    expect(commandRegistry([addNote]).get('notes.add_note')).toBe(addNote);
    expect(() => commandRegistry([addNote, addNote])).toThrow('Two commands are named');
  });
});
