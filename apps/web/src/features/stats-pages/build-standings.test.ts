// The note beside each team in the standings is true of that team (step 2.195; the numbers
// audit's M2 and L4). Each table here is made by the standings engine itself from a few
// made-up games, stored as its rows are, read back by core's standings read and written by
// the page's own builder: the very tables the first test's walk ends on. Each test reads
// the words beside the LOWER team of a level group, where the old note said "placed above".
import { defaultSeasonRules, type SeasonRules } from '@srleagues/contracts';
import { readStandings, type StandingsReadStore } from '@srleagues/core';
import { calculateStandings, type CoinFlip, type StandingsAdjustment } from '@srleagues/sports';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildStandingsViews, type StandingsTableView } from './build-standings.ts';
import { StandingsTables } from './standings-page.tsx';

const seasonId = 'season';

/** A final game: home team, its score, away team, its score. */
type Game = readonly [string, number, string, number];

type Made = { readonly view: StandingsTableView; readonly html: string };

/** A stored row as the database gives it back. */
type StoredRow = Awaited<ReturnType<StandingsReadStore['standingsRows']>>[number];

/**
 * One table of made-up teams (their names are their ids) after these games, as the page
 * draws it: the engine's rows, stored and read back as the database gives them. `binned`
 * teams are in the bin since the table was worked out (their rows stay, as they do until
 * the standings are rebuilt); `stored` changes the stored rows by hand.
 */
async function tableAfter(
  teams: readonly string[],
  games: readonly Game[],
  options: {
    readonly rules?: SeasonRules;
    readonly adjustments?: readonly StandingsAdjustment[];
    readonly coinFlips?: readonly CoinFlip[];
    readonly binned?: readonly string[];
    readonly stored?: (rows: StoredRow[]) => StoredRow[];
  } = {},
): Promise<Made> {
  const rules = options.rules ?? defaultSeasonRules();
  const decided = games.map(([home, homeScore, away, awayScore], n) => ({
    gameId: `game-${n + 1}`,
    status: 'final' as const,
    homeTeamId: home,
    awayTeamId: away,
    homeScore,
    awayScore,
    winnerTeamId: null,
    // A week apart, in the order given.
    startsAt: new Date(Date.UTC(2026, 8, 1 + 7 * n, 18)).toISOString(),
  }));
  const result = calculateStandings({
    teams: teams.map((teamId) => ({ teamId, divisionId: null })),
    games: decided,
    rules,
    adjustments: options.adjustments ?? [],
    coinFlips: options.coinFlips ?? [],
  });
  expect(result.problems.filter((p) => p.leftOut)).toEqual([]);
  const rows = result.tables.flatMap((table) => table.rows);
  const store: StandingsReadStore = {
    findSeason: async (id) => (id === seasonId ? { id, name: 'Fall', rules } : undefined),
    seasonStatKeys: async () => [],
    teams: async () =>
      teams
        .filter((name) => !(options.binned ?? []).includes(name))
        .map((name) => ({
          id: name,
          name,
          slug: name.toLowerCase(),
          color: null,
          divisionId: null,
          statsVisibility: 'everyone',
        })),
    divisions: async () => [],
    standingsRows: async () =>
      (options.stored ?? ((stored: StoredRow[]) => stored))(
        rows.map((row) => ({
          teamId: row.teamId,
          divisionId: row.divisionId,
          rank: row.rank,
          seed: row.seed,
          gamesPlayed: row.gamesPlayed,
          wins: row.wins,
          losses: row.losses,
          ties: row.ties,
          pointsFor: row.pointsFor,
          pointsAgainst: row.pointsAgainst,
          standingsPoints: row.points,
          streakResult: row.streak?.result ?? null,
          streakLength: row.streak?.length ?? null,
          decidedBy: row.decidedBy,
        })),
      ),
    adjustments: async () =>
      (options.adjustments ?? []).map((a) => ({
        id: a.adjustmentId,
        teamId: a.teamId,
        wins: a.wins ?? 0,
        losses: a.losses ?? 0,
        ties: a.ties ?? 0,
        points: a.points ?? 0,
        reason: a.reason,
      })),
    playerTotals: async () => [],
    playerTeams: async () => [],
    // The standings read no box score line: only the games' teams, to count meetings.
    decidedGamesOf: async () => {
      throw new Error('the standings read no box score line');
    },
    decidedGames: async () =>
      decided.map((game) => ({
        gameId: game.gameId,
        status: game.status,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
      })),
    teamStatTotals: async () => [],
    teamTurnoverGames: async () => [],
    people: async () => [],
  };
  const read = await readStandings(store, { seasonId });
  if (!read.ok) throw new Error('expected standings');
  const [view] = buildStandingsViews(read.value);
  if (view === undefined) throw new Error('expected a table');
  return {
    view,
    html: renderToStaticMarkup(createElement(StandingsTables, { tables: [view] })),
  };
}

/** The teams in the table's order. */
const order = ({ view }: Made) => view.rows.map((row) => row.team);

/** Every note marked beside a team, in full. */
function notesBeside({ view }: Made, team: string): string[] {
  const row = view.rows.find((r) => r.team === team);
  if (row === undefined) throw new Error(`no row for ${team}`);
  return (row.notes ?? []).map((id) => view.footnotes.find((f) => f.id === id)?.text ?? '');
}

/** The note about level teams beside a team: there is one at most. */
function levelNoteBeside(made: Made, team: string): string | undefined {
  const row = made.view.rows.find((r) => r.team === team);
  const ids = (row?.notes ?? []).filter((id) => !id.startsWith('adjustment-'));
  expect(ids.length).toBeLessThanOrEqual(1);
  return made.view.footnotes.find((f) => f.id === ids[0])?.text;
}

/** No sentence anywhere that only the first of a group could be told. */
function nothingPlacedAbove({ view, html }: Made) {
  expect(html).not.toMatch(/placed above/i);
  expect(html).not.toMatch(/level on record/i);
  for (const note of view.footnotes) expect(note.text).not.toMatch(/placed above/i);
}

/** The note's mark is drawn beside the team, and its words under the table. */
function drawnBeside({ view, html }: Made, team: string, text: string) {
  const row = view.rows.find((r) => r.team === team);
  const id = row?.notes?.find((n) => view.footnotes.some((f) => f.id === n && f.text === text));
  expect(id).toBeDefined();
  const number = view.footnotes.findIndex((f) => f.id === id) + 1;
  expect(html).toContain(
    `<span class="ui-team-name">${team}</span><sup class="ui-note-mark" dir="auto"><a href="#${view.key}-note-${id}"> <span class="ui-visually-hidden">Note</span> ${number}</a></sup>`,
  );
  expect(html).toContain(`id="${view.key}-note-${id}" dir="auto">${text}</li>`);
}

// The written walk (docs/build/first-test.md): game 1, Wolves at Ravens, scored live, 7 to
// 6; game 2 a week later, Ravens at Wolves, typed in as 50 to 45 for the Wolves.
const game1: Game = ['Ravens', 7, 'Wolves', 6];
const game2: Game = ['Wolves', 50, 'Ravens', 45];

describe('the note beside each team of the standings', () => {
  // The lead's review, item 3: one number, one way. The PCT column writes a win percentage
  // as the notes do, as a basketball table does, never 0.500.
  it('writes the PCT column as the notes do: .500, 1.000, .000', async () => {
    const walk = await tableAfter(['Ravens', 'Wolves'], [game1, game2]);
    expect(walk.view.rows.map((row) => row.cells['winPercentage'])).toEqual(['.500', '.500']);
    expect(levelNoteBeside(walk, 'Ravens')).toContain('(.500)');
    const round = await tableAfter(
      ['Ash', 'Birch', 'Cedar'],
      [
        ['Ash', 50, 'Birch', 45],
        ['Ash', 50, 'Cedar', 40],
        ['Cedar', 50, 'Birch', 40],
      ],
    );
    expect(round.view.rows.map((row) => [row.team, row.cells['winPercentage']])).toEqual([
      ['Ash', '1.000'],
      ['Cedar', '.500'],
      ['Birch', '.000'],
    ]);
    expect(round.html).not.toMatch(/>0\.\d{3}</);
  });

  it('two teams and one game: nobody is level, so no team carries a note', async () => {
    const made = await tableAfter(['Ravens', 'Wolves'], [game1]);
    expect(order(made)).toEqual(['Ravens', 'Wolves']);
    expect(notesBeside(made, 'Ravens')).toEqual([]);
    expect(notesBeside(made, 'Wolves')).toEqual([]);
    expect(made.view.footnotes).toEqual([]);
  });

  it("the walk's own table (case 7): the Ravens, second, are told what put the Wolves ahead", async () => {
    const made = await tableAfter(['Ravens', 'Wolves'], [game1, game2]);
    expect(order(made)).toEqual(['Wolves', 'Ravens']);
    const note =
      'Wolves and Ravens are level on win percentage (.500). Point difference puts Wolves ahead: +4 against -4.';
    expect(levelNoteBeside(made, 'Ravens')).toBe(note);
    expect(levelNoteBeside(made, 'Wolves')).toBe(note);
    // One note for the group, marked beside both.
    expect(made.view.footnotes).toHaveLength(1);
    drawnBeside(made, 'Ravens', note);
    drawnBeside(made, 'Wolves', note);
    nothingPlacedAbove(made);
  });

  // The Wolves, last at 0–1, are level at .000 with the Hawks, who have not played: the
  // Hawks are told that, and the Wolves are in no note about teams level with them (the
  // lead's review of step 2.195, item 8).
  it('three teams and one game: the idle team is told it has not played, the Wolves nothing false', async () => {
    const made = await tableAfter(['Ravens', 'Wolves', 'Hawks'], [game1]);
    expect(order(made)).toEqual(['Ravens', 'Hawks', 'Wolves']);
    const note = 'Hawks have not played yet.';
    expect(levelNoteBeside(made, 'Hawks')).toBe(note);
    expect(notesBeside(made, 'Wolves')).toEqual([]);
    expect(notesBeside(made, 'Ravens')).toEqual([]);
    drawnBeside(made, 'Hawks', note);
    nothingPlacedAbove(made);
  });

  it('four teams and one round: each pair has its own note, true of both its teams', async () => {
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar', 'Dogwood'],
      [
        ['Ash', 50, 'Birch', 45],
        ['Cedar', 60, 'Dogwood', 50],
      ],
    );
    expect(order(made)).toEqual(['Cedar', 'Ash', 'Birch', 'Dogwood']);
    const winners =
      'Cedar and Ash are level on win percentage (1.000). Point difference puts Cedar ahead: +10 against +5.';
    const losers =
      'Birch and Dogwood are level on win percentage (.000). Point difference puts Birch ahead: -5 against -10.';
    expect(levelNoteBeside(made, 'Cedar')).toBe(winners);
    expect(levelNoteBeside(made, 'Ash')).toBe(winners);
    expect(levelNoteBeside(made, 'Birch')).toBe(losers);
    expect(levelNoteBeside(made, 'Dogwood')).toBe(losers);
    expect(made.view.footnotes.map((f) => f.text)).toEqual([winners, losers]);
    nothingPlacedAbove(made);
  });

  it('a points table with a deduction (case 30): Cedar reads "level on points" and the game that decided it', async () => {
    const rules: SeasonRules = {
      ...defaultSeasonRules(),
      standings: {
        ...defaultSeasonRules().standings,
        rankBy: 'points',
        columns: ['played', 'wins', 'losses', 'points', 'point-difference'],
      },
    };
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar'],
      [
        ['Birch', 50, 'Cedar', 40],
        ['Cedar', 45, 'Ash', 40],
        ['Ash', 48, 'Birch', 44],
      ],
      {
        rules,
        adjustments: [{ adjustmentId: 'a1', teamId: 'Ash', points: -2, reason: 'Late forms.' }],
      },
    );
    expect(order(made)).toEqual(['Birch', 'Cedar', 'Ash']);
    expect(made.view.columns.map((c) => c.key)).toContain('points');
    const note = 'Birch and Cedar are level on points (2). The game between them puts Birch ahead.';
    expect(levelNoteBeside(made, 'Cedar')).toBe(note);
    expect(levelNoteBeside(made, 'Birch')).toBe(note);
    // Ash, at 0 after its deduction, is level with nobody: only its adjustment is noted.
    expect(notesBeside(made, 'Ash')).toEqual(['Adjusted by -2 points. Late forms.']);
    drawnBeside(made, 'Cedar', note);
    nothingPlacedAbove(made);
  });

  it('three level in a circle (case 31): Cedar, last, reads what they are level on and the tiebreakers', async () => {
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar'],
      [
        ['Ash', 50, 'Birch', 45],
        ['Birch', 60, 'Cedar', 50],
        ['Cedar', 42, 'Ash', 40],
      ],
    );
    expect(order(made)).toEqual(['Birch', 'Ash', 'Cedar']);
    const note =
      'Birch, Ash, and Cedar are level on win percentage (.500). The season’s tiebreakers set their order: head-to-head, then point difference, then points scored.';
    for (const team of ['Birch', 'Ash', 'Cedar']) expect(levelNoteBeside(made, team)).toBe(note);
    expect(made.view.footnotes).toHaveLength(1);
    drawnBeside(made, 'Cedar', note);
    nothingPlacedAbove(made);
  });

  it('a team with no games (case 34): Cedar at 0–0 has not played; Birch at 0–1 carries no level note', async () => {
    const made = await tableAfter(['Ash', 'Birch', 'Cedar'], [['Ash', 60, 'Birch', 50]]);
    expect(order(made)).toEqual(['Ash', 'Cedar', 'Birch']);
    expect(levelNoteBeside(made, 'Cedar')).toBe('Cedar have not played yet.');
    expect(notesBeside(made, 'Birch')).toEqual([]);
    nothingPlacedAbove(made);
  });

  it('a level note stands only among teams that have played; idle ones are told so together', async () => {
    // Birch and Dogwood both lost; Cedar and Elm have not played: four level at .000.
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar', 'Dogwood', 'Elm'],
      [
        ['Ash', 60, 'Birch', 50],
        ['Ash', 60, 'Dogwood', 40],
      ],
    );
    expect(order(made)).toEqual(['Ash', 'Cedar', 'Elm', 'Birch', 'Dogwood']);
    for (const team of ['Cedar', 'Elm']) {
      expect(levelNoteBeside(made, team)).toBe('Cedar and Elm have not played yet.');
    }
    const note =
      'Birch and Dogwood are level on win percentage (.000). Point difference puts Birch ahead: -10 against -20.';
    expect(levelNoteBeside(made, 'Birch')).toBe(note);
    expect(levelNoteBeside(made, 'Dogwood')).toBe(note);
    nothingPlacedAbove(made);
  });

  // The independent review's run (item 1): A, B and C level at .500, A beat C and C beat B,
  // A and B never met. With C in the bin its row is not shown, and A and B look like a pair
  // head-to-head separated: they never played, so the note may not say it was the games
  // between them.
  it('never says the games between two teams that never met put one ahead', async () => {
    const games: readonly Game[] = [
      ['Ash', 50, 'Cedar', 40],
      ['Cedar', 50, 'Birch', 40],
      ['Xeno', 50, 'Ash', 40],
      ['Birch', 50, 'Yew', 40],
    ];
    const teams = ['Ash', 'Birch', 'Cedar', 'Xeno', 'Yew'];
    const whole = await tableAfter(teams, games);
    expect(order(whole)).toEqual(['Xeno', 'Ash', 'Cedar', 'Birch', 'Yew']);
    const made = await tableAfter(teams, games, { binned: ['Cedar'] });
    expect(order(made)).toEqual(['Xeno', 'Ash', 'Birch', 'Yew']);
    const note =
      'Ash and Birch are level on win percentage (.500). The season’s tiebreakers set their order: head-to-head, then point difference, then points scored.';
    expect(levelNoteBeside(made, 'Birch')).toBe(note);
    expect(levelNoteBeside(made, 'Ash')).toBe(note);
    expect(made.html).not.toContain('between them');
  });

  // Item 5: four teams at 1–1; head-to-head puts two above two, and nothing separates
  // either pair. They are not all in one place, so not "level with another team" alone.
  it('four level whom head-to-head split two above two, each pair still level', async () => {
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar', 'Dogwood', 'Xeno', 'Yew'],
      [
        ['Ash', 50, 'Cedar', 40],
        ['Birch', 50, 'Dogwood', 40],
        ['Xeno', 50, 'Ash', 40],
        ['Xeno', 50, 'Birch', 40],
        ['Cedar', 50, 'Yew', 40],
        ['Dogwood', 50, 'Yew', 40],
      ],
    );
    expect(order(made)).toEqual(['Xeno', 'Ash', 'Birch', 'Cedar', 'Dogwood', 'Yew']);
    const note =
      'Ash, Birch, Cedar, and Dogwood are level on win percentage (.500). The season’s tiebreakers set their order as far as they can: head-to-head, then point difference, then points scored. Ash and Birch are still level after all of them, so they are shown in a fixed order. Cedar and Dogwood are still level after all of them, so they are shown in a fixed order.';
    for (const team of ['Ash', 'Birch', 'Cedar', 'Dogwood']) {
      expect(levelNoteBeside(made, team)).toBe(note);
    }
    expect(made.view.footnotes.map((f) => f.id)).not.toContain('order-still-tied');
  });

  // Item 9: two level teams whose stored reasons differ (a row not of the engine's
  // making): no two-team reason is claimed, only what both rows can bear.
  it('claims no reason for two level teams whose stored reasons differ', async () => {
    const made = await tableAfter(['Ravens', 'Wolves'], [game1, game2], {
      stored: (rows) =>
        rows.map((row) => (row.teamId === 'Ravens' ? { ...row, decidedBy: 'points-scored' } : row)),
    });
    const note =
      'Wolves and Ravens are level on win percentage (.500). The season’s tiebreakers set their order: head-to-head, then point difference, then points scored.';
    expect(levelNoteBeside(made, 'Ravens')).toBe(note);
    expect(levelNoteBeside(made, 'Wolves')).toBe(note);
  });

  it('says "games" when the two met more than once', async () => {
    const made = await tableAfter(
      ['Owls', 'Falcons', 'Herons', 'Dogs'],
      [
        ['Owls', 50, 'Falcons', 40],
        ['Falcons', 44, 'Owls', 46],
        ['Falcons', 60, 'Herons', 40],
        ['Herons', 41, 'Falcons', 55],
        ['Herons', 50, 'Owls', 30],
        ['Owls', 40, 'Herons', 52],
        ['Herons', 50, 'Dogs', 40],
      ],
    );
    expect(order(made).slice(1, 3)).toEqual(['Owls', 'Falcons']);
    const note =
      'Owls and Falcons are level on win percentage (.500). The games between them put Owls ahead.';
    expect(levelNoteBeside(made, 'Falcons')).toBe(note);
    nothingPlacedAbove(made);
  });

  it('names points scored, fewest points allowed and a coin flip with their numbers', async () => {
    const games: readonly Game[] = [
      ['Ash', 60, 'Zed', 50],
      ['Birch', 50, 'Zed', 40],
    ];
    const scored = await tableAfter(['Ash', 'Birch', 'Zed'], games);
    expect(levelNoteBeside(scored, 'Birch')).toBe(
      'Ash and Birch are level on win percentage (1.000). Points scored puts Ash ahead: 60 against 50.',
    );
    const allowed = await tableAfter(['Ash', 'Birch', 'Zed'], games, {
      rules: { ...defaultSeasonRules(), tiebreakers: ['fewest-points-allowed'] },
    });
    expect(levelNoteBeside(allowed, 'Ash')).toBe(
      'Birch and Ash are level on win percentage (1.000). Fewer points allowed puts Birch ahead: 40 against 50.',
    );
    // Harbor City's shape (case 47): two beaten by the same score, never met; a coin flip.
    const flipped = await tableAfter(
      ['Comets', 'Meteors', 'Rockets'],
      [
        ['Comets', 30, 'Rockets', 22],
        ['Comets', 30, 'Meteors', 22],
      ],
      {
        rules: { ...defaultSeasonRules(), tiebreakers: ['point-difference', 'coin-flip'] },
        coinFlips: [['Rockets', 'Meteors']],
      },
    );
    expect(order(flipped)).toEqual(['Comets', 'Rockets', 'Meteors']);
    expect(levelNoteBeside(flipped, 'Meteors')).toBe(
      'Rockets and Meteors are level on win percentage (.000). A coin flip puts Rockets ahead.',
    );
    for (const made of [scored, allowed, flipped]) nothingPlacedAbove(made);
  });

  it('keeps today’s sentence for teams that nothing separates', async () => {
    const made = await tableAfter(
      ['Comets', 'Meteors', 'Rockets'],
      [
        ['Comets', 30, 'Rockets', 22],
        ['Comets', 30, 'Meteors', 22],
      ],
    );
    const note =
      'Level with another team: nothing in the rules separates them yet, so they are shown in a fixed order.';
    expect(levelNoteBeside(made, 'Meteors')).toBe(note);
    expect(levelNoteBeside(made, 'Rockets')).toBe(note);
    expect(made.view.footnotes.map((f) => f.id)).toEqual(['order-still-tied']);
  });

  it('three level where two stay level after every tiebreaker: says so, and claims nothing more', async () => {
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar', 'Wren', 'Zed'],
      [
        ['Ash', 60, 'Zed', 50],
        ['Wren', 50, 'Ash', 45],
        ['Birch', 50, 'Zed', 45],
        ['Wren', 50, 'Birch', 45],
        ['Cedar', 50, 'Zed', 45],
        ['Wren', 50, 'Cedar', 45],
      ],
    );
    expect(order(made)).toEqual(['Wren', 'Ash', 'Birch', 'Cedar', 'Zed']);
    const note =
      'Ash, Birch, and Cedar are level on win percentage (.500). The season’s tiebreakers set their order as far as they can: head-to-head, then point difference, then points scored. Birch and Cedar are still level after all of them, so they are shown in a fixed order.';
    for (const team of ['Ash', 'Birch', 'Cedar']) expect(levelNoteBeside(made, team)).toBe(note);
    nothingPlacedAbove(made);
  });
});
