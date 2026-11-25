import { randomUUID } from 'node:crypto';
import {
  applyTrackerCommands,
  getBoxScoreSheet,
  openScoringSession,
  readTrackedBoxScore,
  type AccessReader,
  type TrackedGridRow,
} from '@srleagues/core';
import { en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { namesShownOf, startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInGameId, standInGames } from '../../server/stand-in-games.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import type { FormState } from './form-state.ts';
import { trackedGridProblemKey } from './problem-keys.ts';
import { runBoxScoreAction } from './run-box-score-action.ts';
import { runTrackedGridAction } from './run-tracked-grid-action.ts';
import { playMark, playSentences, trackedGridColumns, trackedGridField } from './tracked-grid.ts';
import { TrackedGridForm } from './tracked-grid-form.tsx';

// The form's answer, as the test sets it: a static render cannot post, so the answer a
// post would give is handed to the form here.
const answer = vi.hoisted(() => ({ state: { kind: 'untouched' } as FormState }));
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return { ...react, useActionState: () => [answer.state, () => undefined, false] };
});

const leagueId = '01900000-0000-7000-8000-000000000001';
const owner = '01900000-0000-7000-8000-0000000000a1';
const access: AccessReader = {
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
};
/** Lions v Tigers, still to play today: scored here with the tracker. */
const trackedId = standInGameId(1);
const ctx = { leagueId, accountId: owner, requestId: 'r1' };

/** The made-up world. */
const world = () =>
  standInGames(
    testWorld(() => access),
    {
      people: {},
      namesShownOf: namesShownOf(startingNamePolicy, () => 'adult'),
    },
  );

let tapNumber = 0;
/** A tap with a fresh id. */
const tap = (input: unknown) => {
  tapNumber += 1;
  return { commandId: randomUUID(), at: Date.now() - 60_000 + tapNumber, input };
};

/**
 * Lions v Tigers scored with the tracker: tipped off, a basket of 2 and a foul for the
 * home team's first player, and (unless `live`) ended and reopened with a reason.
 */
async function trackedGame(live = false) {
  const ports = world();
  const sheet = await getBoxScoreSheet(ctx, { gameId: trackedId }, ports.deps);
  if (!sheet.ok) throw new Error(sheet.error.code);
  const { game, players } = sheet.value;
  const of = (teamId: string) => players.filter((p) => p.teamId === teamId).map((p) => p.personId);
  const home = of(game.homeTeamId);
  const opened = await openScoringSession(
    ctx,
    { gameId: trackedId, deviceId: 'tablet' },
    ports.deps,
  );
  if (!opened.ok || opened.value.status !== 'held-by-you') throw new Error('not opened');
  const sent = await applyTrackerCommands(
    ctx,
    {
      gameId: trackedId,
      protocolVersion: 1,
      sessionId: opened.value.sessionId,
      commands: [
        tap({ type: 'lineup', side: 'home', playerIds: home.slice(0, 5) }),
        tap({ type: 'lineup', side: 'away', playerIds: of(game.awayTeamId).slice(0, 5) }),
        tap({ type: 'start' }),
        tap({ type: 'score', side: 'home', playerId: home[0], points: 2 }),
        tap({ type: 'foul', side: 'home', playerId: home[0] }),
        ...(live ? [] : [tap({ type: 'end' })]),
      ],
    },
    ports.deps,
  );
  expect(sent.ok).toBe(true);
  if (!live) {
    const reopened = await runBoxScoreAction(
      'reopen',
      {
        gameId: trackedId,
        door: 'tracked',
        requestId: randomUUID(),
        reason: 'A foul given to the wrong player',
      },
      ctx,
      ports.deps,
    );
    expect(reopened).toEqual({ ok: true });
  }
  const read = async () => {
    const now = await readTrackedBoxScore(ctx, { gameId: trackedId }, ports.deps);
    if (!now.ok) throw new Error(now.error.code);
    return now.value;
  };
  const drawn = await getBoxScoreSheet(ctx, { gameId: trackedId }, ports.deps);
  return { ports, read, statKeys: drawn.ok ? drawn.value.statKeys : [] };
}

/** Every box of the grid as the read gives it, as the form posts it, with some changed. */
function posted(
  read: { readonly sequence: number; readonly lines: readonly TrackedGridRow[] },
  statKeys: readonly string[],
  change: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const fields: Record<string, string> = { gameId: trackedId, sequence: String(read.sequence) };
  for (const row of read.lines) {
    for (const stat of trackedGridColumns(statKeys)) {
      fields[trackedGridField(row.personId, stat)] = String(row[stat]);
    }
  }
  return { ...fields, ...change };
}

describe('the grid of a tracked game (step 2.65)', () => {
  it('moves a foul to the right player as plays, and the plays give the new lines', async () => {
    const { ports, read, statKeys } = await trackedGame();
    const before = await read();
    expect(before.correctable).toBe(true);
    const [first, second] = before.lines;
    if (first === undefined || second === undefined) throw new Error('no players');
    // A foul given to the first player that was the second's.
    const given = await runTrackedGridAction(
      posted(before, statKeys, {
        [trackedGridField(first.personId, 'fouls')]: String(first.fouls + 1),
      }),
      ctx,
      ports.deps,
    );
    expect(given.ok && given.plays.map(playMark)).toEqual([`foul:${first.personId}`]);
    const wrong = await read();
    const moved = await runTrackedGridAction(
      posted(wrong, statKeys, {
        [trackedGridField(first.personId, 'fouls')]: String(first.fouls),
        [trackedGridField(second.personId, 'fouls')]: String(second.fouls + 1),
      }),
      ctx,
      ports.deps,
    );
    expect(moved.ok && moved.plays.map(playMark)).toEqual([
      `unfoul:${first.personId}`,
      `foul:${second.personId}`,
    ]);
    // Said after the save as plain sentences, one per play.
    expect(moved.ok && playSentences(moved.plays.map(playMark))).toEqual([
      { key: 'admin.boxScore.tracked.removed.foul', personId: first.personId },
      { key: 'admin.boxScore.tracked.added.foul', personId: second.personId },
    ]);
    const after = await read();
    const lineOf = (personId: string) => after.lines.find((l) => l.personId === personId);
    expect(lineOf(first.personId)?.fouls).toBe(first.fouls);
    expect(lineOf(second.personId)?.fouls).toBe(second.fouls + 1);
    expect(after.sequence).toBeGreaterThan(wrong.sequence);
  });

  it('refuses a grid read before someone else changed the game, a lowered basket and a box that is no count', async () => {
    const { ports, read, statKeys } = await trackedGame();
    const before = await read();
    const [first] = before.lines;
    if (first === undefined) throw new Error('no players');
    const fouls = trackedGridField(first.personId, 'fouls');
    const stale = posted(before, statKeys, { [fouls]: String(first.fouls + 1) });
    expect((await runTrackedGridAction(stale, ctx, ports.deps)).ok).toBe(true);
    // The same grid sent again, as drawn before that save: refused, nothing saved.
    expect(await runTrackedGridAction(stale, ctx, ports.deps)).toEqual({
      ok: false,
      code: 'changed-since-read',
    });
    expect((await read()).lines.find((l) => l.personId === first.personId)?.fouls).toBe(
      first.fouls + 1,
    );
    const now = await read();
    const scored = now.lines.find((l) => l.fg2 > 0);
    if (scored !== undefined) {
      const box = trackedGridField(scored.personId, 'fg2');
      expect(
        await runTrackedGridAction(
          posted(now, statKeys, { [box]: String(scored.fg2 - 1) }),
          ctx,
          ports.deps,
        ),
      ).toEqual({ ok: false, code: 'basket-taken-back', wrong: [box] });
    }
    expect(
      await runTrackedGridAction(posted(now, statKeys, { [fouls]: 'two' }), ctx, ports.deps),
    ).toEqual({ ok: false, code: 'cell', wrong: [fouls] });
  });

  it('is closed to a game not reopened with a reason', async () => {
    const { ports } = await trackedGame(true);
    const read = await readTrackedBoxScore(ctx, { gameId: trackedId }, ports.deps);
    expect(read.ok && read.value.notCorrectable).toBe('reason-needed');
    const sequence = read.ok ? String(read.value.sequence) : '0';
    expect(await runTrackedGridAction({ gameId: trackedId, sequence }, ctx, ports.deps)).toEqual({
      ok: false,
      code: 'gone',
    });
  });
});

describe('the grid form', () => {
  const box = (personId: string, stat: string, saved: string) => ({
    field: `grid-${personId}-${stat}`,
    label: `${stat} for #4 Ada`,
    saved,
  });
  const props = {
    action: async (state: FormState) => state,
    permalink: '/l/admin/games/g/edit',
    hidden: { gameId: 'g', sequence: '7' },
    teams: [
      {
        teamId: 't',
        name: 'Hawks',
        rows: [
          {
            personId: 'a',
            heading: '#4 Ada',
            minutes: '12',
            points: '6',
            boxes: [box('a', 'fg2', '3'), box('a', 'fouls', '1')],
          },
        ],
      },
    ],
    texts: {
      player: 'Player',
      minutes: { short: 'MIN', full: 'Minutes' },
      points: { short: 'PTS', full: 'Points' },
      columns: [
        { short: '2PM', full: '2-point baskets' },
        { short: 'PF', full: 'Fouls' },
      ],
      noPlayers: 'none',
      save: 'Save',
      reload: 'Load it again',
    },
  };
  const draw = (state: FormState) => {
    answer.state = state;
    return renderToStaticMarkup(createElement(TrackedGridForm, props));
  };

  it('shows the plays’ numbers, and after a refusal every box as typed, the sentence beside the box', () => {
    const fresh = draw({ kind: 'untouched' });
    expect(fresh).toContain('name="grid-a-fg2" value="3"');
    expect(fresh).toContain('name="sequence" value="7"');
    expect(fresh).not.toContain('data-grid-problem');
    const lowered = draw({
      kind: 'refused',
      code: 'basket-taken-back',
      typed: { 'grid-a-fg2': '2', 'grid-a-fouls': '4' },
      wrong: ['grid-a-fg2'],
      said: '{cell} cannot go lower here.',
    });
    const described =
      /aria-label="fg2 for #4 Ada" aria-invalid="true" aria-describedby="([^"]+)" name="grid-a-fg2" value="2"\/><span id="([^"]+)"/.exec(
        lowered,
      );
    expect(described?.[1]).toBe(described?.[2]);
    expect(lowered).toContain('name="grid-a-fouls" value="4"');
    expect(lowered).toMatch(
      /aria-invalid="true"[^>]*\/><span[^>]*data-grid-problem="basket-taken-back">fg2 for #4 Ada cannot go lower here\.</,
    );
  });

  it('says a stale grid at the top, with the way to load it again, keeping what was typed', () => {
    const stale = draw({
      kind: 'refused',
      code: 'changed-since-read',
      typed: { 'grid-a-fg2': '5', 'grid-a-fouls': '0' },
      wrong: [],
      said: 'Someone else changed this game.',
    });
    expect(stale).toContain(
      'data-grid-problem="changed-since-read"><p>Someone else changed this game.</p>',
    );
    expect(stale).toContain('href="/l/admin/games/g/edit">Load it again</a>');
    expect(stale).toContain('name="grid-a-fg2" value="5"');
    expect(stale).toContain('name="grid-a-fouls" value="0"');
  });
});

describe('the grid’s words', () => {
  it('words every refusal and every play from the message files', () => {
    for (const code of [
      'basket-taken-back',
      'cell',
      'changed-since-read',
      'engine',
      'gone',
      'player-not-on-team',
      'statistic-not-kept',
    ]) {
      expect(trackedGridProblemKey(code)).toBe(`admin.boxScore.tracked.refused.${code}`);
      expect(en[trackedGridProblemKey(code)]).toBeTruthy();
    }
    const marks = [
      'foul:a',
      'unfoul:a',
      'turnover:a',
      'unturnover:a',
      'score1:a',
      'score2:a',
      'score3:a',
      'odd:a',
    ];
    const said = playSentences(marks);
    expect(said).toHaveLength(7);
    for (const { key } of said) expect(en[key]).toBeTruthy();
  });
});
