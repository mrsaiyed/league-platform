// The transfer's words (step 2.58, T-187), on made-up names only: what the person
// running it reads for each kind of team, player, game and stop.
import { describe, expect, it } from 'vitest';
import type { PlannedGame, PlannedPerson, TransferPlan } from './plan-tracker-transfer.ts';
import type { TransferReport } from './run-tracker-transfer.ts';
import type { TrackerData, TrackerGame, TrackerPlayer } from './tracker-transfer-data.ts';
import { describeTransferPlan, describeTransferReport } from './tracker-transfer-words.ts';

const player = (id: string, teamId: string, name: string, jersey: string): TrackerPlayer => ({
  id,
  teamId,
  name,
  jersey,
  active: true,
});
const sam = player('p-sam', 'owls', 'Sam Example', '4');
const kai = player('p-kai', 'owls', 'Kai Sample', '5');
const fox = player('p-fox', 'foxes', 'Fox One', '30');
const nameless = player('p-none', 'foxes', '', '31');

const game = (id: string, over: Partial<TrackerGame> = {}): TrackerGame => ({
  id,
  homeTeamId: 'owls',
  awayTeamId: 'foxes',
  startsAt: '2026-01-05T00:30:00Z',
  sourceRef: `made-up:${id}`,
  status: 'final',
  homeScore: 40,
  awayScore: 38,
  state: {},
  events: [],
  lines: [],
  ...over,
});

const data: TrackerData = {
  teams: [
    { id: 'owls', name: 'Riverside Owls', school: '', tracked: true },
    { id: 'foxes', name: 'Hillcrest Foxes', school: '', tracked: false },
    { id: 'herons', name: 'Lakeside Herons', school: '', tracked: false },
    { id: 'elks', name: 'Pine Valley Elks', school: '', tracked: false },
  ],
  players: [sam, kai, fox, nameless],
  games: [game('101'), game('102'), game('103', { status: 'live' })],
};
const words = { data, timeZone: 'America/Chicago', withOpponents: false };

const person = (p: TrackerPlayer, match: PlannedPerson['match']): [string, PlannedPerson] => [
  p.id,
  { player: p, teamId: `team-${p.teamId}`, tracked: p.teamId === 'owls', match },
];

const unmatched = { kind: 'unmatched', reason: 'not-found' } as const;

function planWith(
  games: readonly PlannedGame[],
  notBroughtOver: readonly string[] = [],
): TransferPlan {
  return {
    problem: null,
    trackedTeamId: 'team-owls',
    teams: new Map([
      ['owls', { kind: 'matched', teamId: 'team-owls' }],
      ['foxes', { kind: 'matched', teamId: 'team-foxes' }],
      ['herons', { kind: 'unmatched', reason: 'several-here' }],
      ['elks', { kind: 'unmatched', reason: 'not-found' }],
    ]),
    people: new Map([
      person(sam, {
        kind: 'add',
        firstName: 'Sam',
        lastName: 'Example',
        jerseyNumber: '4',
        personId: 'listed',
      }),
      person(kai, { kind: 'problem', reason: 'number-taken' }),
      person(fox, {
        kind: 'add',
        firstName: 'Fox',
        lastName: 'One',
        jerseyNumber: '30',
        personId: null,
      }),
      person(nameless, { kind: 'problem', reason: 'no-name' }),
    ]),
    games,
    notBroughtOver,
    ready: games.every((g) => g.outcome.kind !== 'blocked'),
  };
}

describe('the plan, in words', () => {
  it('names each team, player and game, and counts them', () => {
    const plan = planWith([
      {
        game: game('101'),
        match: unmatched,
        outcome: {
          kind: 'blocked',
          gameId: null,
          problem: { kind: 'not-matched', reason: 'not-found' },
        },
      },
      { game: game('103'), match: unmatched, outcome: { kind: 'skip', reason: 'still-live' } },
    ]);
    const text = describeTransferPlan(words, plan).join('\n');
    expect(text).toContain('Found: Riverside Owls');
    expect(text).toContain(
      'Not matched: Lakeside Herons (more than one team in this season has this name',
    );
    expect(text).toContain('Not in this season: Pine Valley Elks');
    expect(text).toContain(
      'Sam Example (#4): in the league’s list as Sam Example but on no team: taken to be them (the same full name) and put on the roster, number 4',
    );
    expect(text).toContain(
      'Kai Sample (#5): cannot be added: this season asks for unique jersey numbers',
    );
    expect(text).toContain(
      'Fox One (#30) (Hillcrest Foxes): to be added as Fox One, number 30 (only with --with-opponents)',
    );
    expect(text).toContain(
      'It was ended in the tracker, but no game here has its game number, or its day and teams. Add or fix the game in this season’s schedule here first.',
    );
    expect(text).toContain(
      'Not transferred: 2026-01-04 Riverside Owls v Hillcrest Foxes (made-up:103): it has not been ended in the tracker.',
    );
    expect(text).toContain(
      '0 games to transfer, 0 already here, 1 not transferred, 1 game with a problem.',
    );
    expect(text).not.toContain('Warning');
  });

  it('warns when some of the tracked team’s players will not be brought over', () => {
    const lines = describeTransferPlan(words, planWith([], [kai.id]));
    expect(lines.slice(-2)).toEqual([
      'Warning: one of the tracked team’s players is not brought over (the Players list says why), so the transfer is not complete. Put them on the roster here by hand, then run it again:',
      '  Kai Sample (#5)',
    ]);
  });

  it('suggests --with-opponents only for players it would bring in', () => {
    const notHere = (playerIds: string[], withOpponents: string[]): PlannedGame => ({
      game: game('101'),
      match: { kind: 'matched', gameId: 'g', by: 'number' },
      outcome: {
        kind: 'blocked',
        gameId: 'g',
        problem: { kind: 'players-not-here', playerIds, withOpponents },
      },
    });
    const all = describeTransferPlan(words, planWith([notHere([fox.id], [fox.id])])).join('\n');
    expect(all).toContain('brought in only with --with-opponents');
    const some = describeTransferPlan(
      words,
      planWith([notHere([fox.id, nameless.id], [fox.id])]),
    ).join('\n');
    expect(some).toContain('--with-opponents brings in 1 of them; put the others');
    const none = describeTransferPlan(words, planWith([notHere([nameless.id], [])])).join('\n');
    expect(none).not.toContain('--with-opponents brings');
    expect(none).not.toContain('brought in only with');
    expect(none).toContain('Put them on their team’s roster here by hand first');
  });
});

describe('the report, in words', () => {
  const report = (over: Partial<TransferReport>): TransferReport => ({
    added: [],
    transferred: [],
    checked: [],
    notBroughtOver: [],
    stopped: null,
    ...over,
  });

  it('says what was done', () => {
    expect(
      describeTransferReport(
        words,
        report({ added: [sam.id], transferred: [{ trackerGameId: '101', sent: 12 }] }),
      ),
    ).toEqual([
      'Added 1 person to their teams’ rosters.',
      'Transferred: 2026-01-04 Riverside Owls v Hillcrest Foxes (made-up:101): 12 actions sent.',
      'Done: every box score line of 1 game matches the tracker’s.',
    ]);
    expect(describeTransferReport(words, report({ checked: ['101', '102'] })).at(-1)).toBe(
      'Nothing to change: every one of 2 games was already here, and every box score line matches.',
    );
  });

  it('warns after a run that went through without some of the tracked team’s players', () => {
    const lines = describeTransferReport(
      words,
      report({
        transferred: [{ trackerGameId: '101', sent: 12 }],
        notBroughtOver: [kai.id, sam.id],
      }),
    );
    expect(lines.slice(-3)).toEqual([
      'Warning: 2 of the tracked team’s players are not brought over (the Players list says why), so the transfer is not complete. Put them on the roster here by hand, then run it again:',
      '  Kai Sample (#5)',
      '  Sam Example (#4)',
    ]);
  });

  it('says where it stopped and why', () => {
    const at = (stop: NonNullable<TransferReport['stopped']>['stop']) =>
      describeTransferReport(words, report({ stopped: { trackerGameId: '101', stop } }));
    expect(
      at({
        kind: 'result-differs',
        status: 'live',
        here: { home: 40, away: 36 },
        tracker: { home: 40, away: 38 },
      }),
    ).toEqual([
      'Stopped at 2026-01-04 Riverside Owls v Hillcrest Foxes (made-up:101).',
      'The game here is live at 40–36; the tracker ended it 40–38.',
    ]);
    expect(at({ kind: 'not-released', code: 'game-not-found' }).at(-1)).toContain(
      'could not be let go after scoring it (game-not-found)',
    );
    expect(
      describeTransferReport(
        words,
        report({ stopped: { trackerGameId: null, stop: { kind: 'not-ready' } } }),
      ),
    ).toEqual(['Stopped.', 'Nothing was changed: put right the problems above and run it again.']);
  });
});
