import { createTranslator, en } from '@srleagues/site';
import type { BatchCommand } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { keptRows, notAppliedRows } from './kept-plays.ts';
import type { KeptTap } from './queue-storage.ts';
import { testRosters } from './scoring-test-game.test-helper.ts';
import { trackerCatalog } from './tracker-catalog.ts';

const t = createTranslator('en', { en: trackerCatalog(en) });
let n = 0;
const kept = (
  input: BatchCommand['input'],
  moment: KeptTap['moment'] = { period: 2, clockMs: 461_000 },
): KeptTap => ({
  command: { commandId: `tap-${(n += 1)}`, at: 1_000, input } as BatchCommand,
  moment,
});

describe('the "not saved" list, play by play (step 2.37, part 2)', () => {
  it('says each play in the play log’s words, with its period and game clock', () => {
    const [row] = keptRows(
      [kept({ type: 'score', side: 'home', playerId: 'h5', points: 2 })],
      testRosters,
      2,
      t,
    );
    expect(row?.text).toMatch(/\+2|2 points/);
    expect(row?.when).toBe('H2 7:41');
  });

  it('says the clock, Undo and End game in words of their own, oldest first', () => {
    const rows = keptRows(
      [
        kept({ type: 'start' }),
        kept({ type: 'set-clock', ms: 300_000 }),
        kept({ type: 'undo' }),
        kept({ type: 'end' }),
      ],
      testRosters,
      2,
      t,
    );
    expect(rows.map((row) => row.text)).toEqual([
      'Clock started',
      'Clock set to 5:00',
      'Undo',
      'End game',
    ]);
  });

  it('offers "Enter again" on plays only, never on the clock, Undo or End game (S-77)', () => {
    const rows = keptRows(
      [
        kept({ type: 'score', side: 'home', playerId: 'h5', points: 2 }),
        kept({ type: 'foul', side: 'away', playerId: 'a4' }),
        kept({ type: 'start' }),
        kept({ type: 'undo' }),
        kept({ type: 'redo' }),
        kept({ type: 'end' }),
      ],
      testRosters,
      2,
      t,
    );
    expect(rows.map((row) => row.again)).toEqual([true, true, false, false, false, false]);
  });

  it('a tap stored before its moment was kept has no time, and is still listed', () => {
    const [row] = keptRows([kept({ type: 'pause' }, null)], testRosters, 2, t);
    expect(row).toMatchObject({ text: 'Clock paused', when: null });
  });
});

describe('the "not applied" list, play by play (step 2.37, part 2)', () => {
  const refused = (input: BatchCommand['input']) => ({
    command: kept(input).command,
    refusal: { code: 'rule' as const, message: 'refused' },
  });

  it('says each refused play in the same words, oldest first, with no time the league did not keep', () => {
    const rows = notAppliedRows(
      [
        refused({ type: 'start' }),
        refused({ type: 'score', side: 'home', playerId: 'h5', points: 3 }),
      ],
      testRosters,
      2,
      t,
    );
    expect(rows.map((row) => row.when)).toEqual([null, null]);
    expect(rows[0]?.text).toBe('Clock started');
    expect(rows[1]?.text).toMatch(/\+3|3 points/);
  });

  it('leaves out an End game the league did not take: the pad says that one', () => {
    expect(notAppliedRows([refused({ type: 'end' })], testRosters, 2, t)).toEqual([]);
  });
});
