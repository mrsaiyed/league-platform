// The note beside each team in the standings is true of that team (step 2.195; the numbers
// audit's M2 and L4). Each table here is made by the standings engine itself from a few
// made-up games, stored as its rows are, read back by core's standings read and written by
// the page's own builder: the very tables the first test's walk ends on. Each test reads
// the words beside the LOWER team of a level group, where the old note said "placed above".
import { defaultSeasonRules, type SeasonRules } from '@srleagues/contracts';
import { levelDocument, readStandings, type StandingsReadStore } from '@srleagues/core';
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
 * teams are in the bin since the table was worked out and left out of the season's teams
 * (their rows stay, as they do until the standings are rebuilt); `kept` teams are in the
 * bin but kept for their results, marked `removed`, as the season's teams list one with a
 * result in a game not in the bin (A-17, step 2.180); `stored` changes the stored rows by
 * hand.
 */
async function tableAfter(
  teams: readonly string[],
  games: readonly Game[],
  options: {
    readonly rules?: SeasonRules;
    readonly adjustments?: readonly StandingsAdjustment[];
    readonly coinFlips?: readonly CoinFlip[];
    readonly binned?: readonly string[];
    readonly kept?: readonly string[];
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
          removed: (options.kept ?? []).includes(name),
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
          level: levelDocument(row.level),
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

/** The invisible word joiner that holds a record's dash to its numbers (step 2.198). */
const joiner = '⁠';

/** A note as written here: a record's dash held to its numbers, as the page draws it. */
const held = (text: string) => text.replace(/(\d)–(?=\d)/g, `$1${joiner}–${joiner}`);

/**
 * The note about level teams beside a team: there is one at most. Read as a person reads
 * it, without the invisible joiners (the page's own text is checked by drawnBeside).
 */
function levelNoteBeside(made: Made, team: string): string | undefined {
  const row = made.view.rows.find((r) => r.team === team);
  const ids = (row?.notes ?? []).filter(
    (id) => !id.startsWith('adjustment-') && id !== 'removed-team',
  );
  expect(ids.length).toBeLessThanOrEqual(1);
  return made.view.footnotes.find((f) => f.id === ids[0])?.text.replaceAll(joiner, '');
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

  // Step 2.198: the games among them went round in a circle, so point difference decided.
  it('three level in a circle (case 31): Cedar, last, reads the games among them, then point difference', async () => {
    const games: readonly Game[] = [
      ['Ash', 50, 'Birch', 45],
      ['Birch', 60, 'Cedar', 50],
      ['Cedar', 42, 'Ash', 40],
    ];
    const made = await tableAfter(['Ash', 'Birch', 'Cedar'], games);
    expect(order(made)).toEqual(['Birch', 'Ash', 'Cedar']);
    const note =
      'Birch, Ash, and Cedar are level on win percentage (.500). In the games among these three: Birch 1–1, Ash 1–1, Cedar 1–1. By point difference: Birch +5, Ash +3, Cedar -8.';
    for (const team of ['Birch', 'Ash', 'Cedar']) expect(levelNoteBeside(made, team)).toBe(note);
    expect(made.view.footnotes).toHaveLength(1);
    drawnBeside(made, 'Cedar', held(note));
    nothingPlacedAbove(made);
    // Rows saved before step 2.198 keep no steps: the note says only what they can bear.
    const before = await tableAfter(['Ash', 'Birch', 'Cedar'], games, {
      stored: (rows) => rows.map((row) => ({ ...row, level: null })),
    });
    const general =
      'Birch, Ash, and Cedar are level on win percentage (.500). The season’s tiebreakers set their order: head-to-head, then point difference, then points scored.';
    for (const team of ['Birch', 'Ash', 'Cedar'])
      expect(levelNoteBeside(before, team)).toBe(general);
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
  // A and B never met. With C in the bin and left out of the season's teams (the next test
  // has it kept for its results, A-17) its row is not shown, and A and B look like a pair
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

  // Step 2.180 (A-17): a team in the bin with results kept is shown, marked, and its row
  // holds its place. So it is one of the level teams: the note counts and names it, as it
  // names only teams the reader can see, and it carries the bin's note besides.
  it('counts and names a team in the bin kept for its results, shown with its mark', async () => {
    const games: readonly Game[] = [
      ['Ash', 50, 'Cedar', 40],
      ['Cedar', 50, 'Birch', 40],
      ['Xeno', 50, 'Ash', 40],
      ['Birch', 50, 'Yew', 40],
    ];
    const teams = ['Ash', 'Birch', 'Cedar', 'Xeno', 'Yew'];
    const whole = await tableAfter(teams, games);
    const made = await tableAfter(teams, games, { kept: ['Cedar'] });
    expect(order(made)).toEqual(['Xeno', 'Ash', 'Cedar', 'Birch', 'Yew']);
    expect(made.view.rows.map((r) => r.seed)).toEqual(whole.view.rows.map((r) => r.seed));
    const note = levelNoteBeside(made, 'Cedar');
    expect(note).toBe(levelNoteBeside(whole, 'Cedar'));
    expect(note).toMatch(/^Ash, Cedar,? and Birch are level/);
    expect(levelNoteBeside(made, 'Ash')).toBe(note);
    expect(levelNoteBeside(made, 'Birch')).toBe(note);
    const removedNote = made.view.footnotes.find((f) => f.id === 'removed-team')?.text;
    expect(removedNote).toBeDefined();
    expect(notesBeside(made, 'Cedar')).toContain(removedNote);
    expect(notesBeside(made, 'Ash')).not.toContain(removedNote);
    nothingPlacedAbove(made);
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
    // Step 2.198: the games among them, and nothing more for the two pairs, whose figures
    // are all level.
    const note =
      'Ash, Birch, Cedar, and Dogwood are level on win percentage (.500). In the games among these four: Ash 1–0, Birch 1–0, Cedar 0–1, Dogwood 0–1. Nothing in the season’s tiebreakers separates Ash and Birch yet, so they are shown in a fixed order. Nothing in the season’s tiebreakers separates Cedar and Dogwood yet, so they are shown in a fixed order.';
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
    expect(made.html).not.toContain('also level');
    // Step 2.198: they never met one another, point difference put Ash first, and the
    // other two are level on every figure.
    const note =
      'Ash, Birch, and Cedar are level on win percentage (.500). Head-to-head does not count here: none of them has played another. By point difference: Ash +5, Birch 0, Cedar 0. Nothing in the season’s tiebreakers separates Birch and Cedar yet, so they are shown in a fixed order.';
    for (const team of ['Ash', 'Birch', 'Cedar']) expect(levelNoteBeside(made, team)).toBe(note);
    nothingPlacedAbove(made);
  });
});

describe('the columns the season chose (step 2.47; the numbers audit M7)', () => {
  const games: readonly Game[] = [
    ['Ash', 50, 'Birch', 40],
    ['Birch', 45, 'Cedar', 44],
  ];
  const withColumns = (columns: SeasonRules['standings']['columns'], more = {}): SeasonRules => ({
    ...defaultSeasonRules(),
    ...more,
    standings: { ...defaultSeasonRules().standings, columns },
  });
  const keys = (made: Made) => made.view.columns.map((c) => c.key);

  it('draws the chosen columns in the season’s own order, and no other', async () => {
    const made = await tableAfter(['Ash', 'Birch', 'Cedar'], games, {
      rules: withColumns(['wins', 'losses', 'point-difference', 'played', 'streak']),
    });
    expect(keys(made)).toEqual(['wins', 'losses', 'pointDifference', 'played', 'streak']);
    // The headings, and nothing of a column left out.
    expect(made.html).toContain('>DIFF<');
    expect(made.html).not.toContain('>PF<');
    expect(made.html).not.toContain('>PCT<');
  });

  it('draws the starting columns for a season on the starting rules', async () => {
    const made = await tableAfter(['Ash', 'Birch', 'Cedar'], games);
    expect(keys(made)).toEqual(['played', 'wins', 'losses', 'winPercentage', 'pointDifference']);
  });

  it('draws nothing for "last five", which nothing works out yet', async () => {
    const made = await tableAfter(['Ash', 'Birch', 'Cedar'], games, {
      rules: withColumns(['played', 'last-five', 'wins']),
    });
    expect(keys(made)).toEqual(['played', 'wins']);
  });

  it('adds the ties column after the last column in view when a game was tied', async () => {
    const made = await tableAfter(['Ash', 'Birch'], [['Ash', 40, 'Birch', 40]], {
      rules: withColumns(['played', 'wins', 'losses', 'win-percentage'], { allowTies: true }),
    });
    expect(keys(made)).toEqual(['played', 'wins', 'losses', 'winPercentage', 'ties']);
  });

  // The table's rule: the columns in view on a phone come first among those drawn there.
  it('keeps the phone’s columns first, with and without a tie, and in a points table', async () => {
    const flags = (made: Made) => made.view.columns.map((c) => `${c.key}:${c.narrow ?? 'scroll'}`);
    const chosen: SeasonRules['standings']['columns'] = [
      'played',
      'wins',
      'losses',
      'win-percentage',
      'point-difference',
      'streak',
    ];
    const plain = await tableAfter(['Ash', 'Birch', 'Cedar'], games, {
      rules: withColumns(chosen, { allowTies: true }),
    });
    expect(flags(plain)).toEqual([
      'played:left-out',
      'wins:in-view',
      'losses:in-view',
      'winPercentage:in-view',
      'pointDifference:scroll',
      'streak:scroll',
    ]);
    const tied = await tableAfter(['Ash', 'Birch'], [['Ash', 40, 'Birch', 40]], {
      rules: withColumns(chosen, { allowTies: true }),
    });
    expect(flags(tied)).toEqual([
      'played:left-out',
      'wins:in-view',
      'losses:in-view',
      'winPercentage:in-view',
      'ties:in-view',
      'pointDifference:scroll',
      'streak:scroll',
    ]);
    const rules = defaultSeasonRules();
    const pointsTable = await tableAfter(['Ash', 'Birch'], [['Ash', 40, 'Birch', 40]], {
      rules: {
        ...rules,
        allowTies: true,
        standings: {
          ...rules.standings,
          rankBy: 'points',
          columns: ['played', 'wins', 'losses', 'points', 'win-percentage', 'point-difference'],
        },
      },
    });
    expect(flags(pointsTable)).toEqual([
      'played:left-out',
      'wins:in-view',
      'losses:in-view',
      'points:in-view',
      'ties:in-view',
      'winPercentage:left-out',
      'pointDifference:scroll',
    ]);
  });
});

// Step 2.198 (S-74; the numbers audit's M4 and cases 31 to 33 and 46; the reader's own
// example): for three or more level teams the note says exactly what placed each of them,
// from the steps the engine kept: their records in the games among them, then what
// separated those still level, with both figures. One note, true beside each of them.
describe('the note for three or more level teams', () => {
  /** The one note beside each of these teams, the same for all of them. */
  function sharedNote(made: Made, teams: readonly string[]): string | undefined {
    const notes = teams.map((team) => levelNoteBeside(made, team));
    for (const note of notes) expect(note).toBe(notes[0]);
    nothingPlacedAbove(made);
    return notes[0];
  }

  it('case 46 (North Valley, West): the Lions, who beat the Bears, and the Tigers by point difference', async () => {
    const made = await tableAfter(
      ['Otters', 'Badgers', 'Lions', 'Tigers', 'Hawks', 'Bears'],
      [
        ['Tigers', 55, 'Hawks', 48],
        ['Bears', 60, 'Badgers', 52],
        ['Hawks', 51, 'Tigers', 47],
        ['Otters', 58, 'Lions', 49],
        ['Lions', 50, 'Bears', 44],
      ],
    );
    expect(order(made)).toEqual(['Otters', 'Lions', 'Tigers', 'Hawks', 'Bears', 'Badgers']);
    const note =
      'Lions, Tigers, Hawks, and Bears are level on win percentage (.500). In the games among these four: Lions 1–0, Tigers 1–1, Hawks 1–1, Bears 0–1. Tigers and Hawks split their games with each other (1–1). Point difference puts Tigers ahead of Hawks: +3 against -3.';
    expect(sharedNote(made, ['Lions', 'Tigers', 'Hawks', 'Bears'])).toBe(note);
    // On the page each record's dash is held to its numbers, so "0–1" never breaks in two.
    drawnBeside(made, 'Bears', held(note));
    expect(made.html).toContain(`Bears 0${joiner}–${joiner}1.`);
    expect(notesBeside(made, 'Otters')).toEqual([]);
    expect(notesBeside(made, 'Badgers')).toEqual([]);
    // With the Bears in the bin, the three shown are not the four the engine compared:
    // the note claims only what the rows can bear.
    const binned = await tableAfter(
      ['Otters', 'Badgers', 'Lions', 'Tigers', 'Hawks', 'Bears'],
      [
        ['Tigers', 55, 'Hawks', 48],
        ['Bears', 60, 'Badgers', 52],
        ['Hawks', 51, 'Tigers', 47],
        ['Otters', 58, 'Lions', 49],
        ['Lions', 50, 'Bears', 44],
      ],
      { binned: ['Bears'] },
    );
    expect(sharedNote(binned, ['Lions', 'Tigers', 'Hawks'])).toBe(
      'Lions, Tigers, and Hawks are level on win percentage (.500). The season’s tiebreakers set their order: head-to-head, then point difference, then points scored.',
    );
  });

  it('the reader’s four: head-to-head, which put B third, is named, then what split each pair', async () => {
    // A beat B, D beat C, all four 1–1. B has the best point difference of the four.
    const made = await tableAfter(
      ['A', 'B', 'C', 'D', 'E', 'F'],
      [
        ['A', 60, 'B', 55],
        ['E', 51, 'A', 50],
        ['D', 45, 'C', 40],
        ['E', 41, 'D', 40],
        ['B', 80, 'F', 60],
        ['C', 50, 'F', 45],
      ],
    );
    expect(order(made)).toEqual(['E', 'A', 'D', 'B', 'C', 'F']);
    expect(sharedNote(made, ['A', 'D', 'B', 'C'])).toBe(
      'A, D, B, and C are level on win percentage (.500). In the games among these four: A 1–0, D 1–0, B 0–1, C 0–1. A and D are also level on point difference (+4). Points scored puts A ahead of D: 110 against 85. Point difference puts B ahead of C: +15 against 0.',
    );
  });

  it('case 32: head-to-head orders all three, and the note gives their records', async () => {
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar', 'Dogwood', 'Elm'],
      [
        ['Ash', 50, 'Birch', 40],
        ['Ash', 50, 'Cedar', 40],
        ['Birch', 50, 'Cedar', 40],
        ['Elm', 50, 'Ash', 40],
        ['Dogwood', 50, 'Ash', 40],
        ['Elm', 50, 'Birch', 40],
        ['Birch', 50, 'Dogwood', 40],
        ['Cedar', 50, 'Elm', 40],
        ['Cedar', 50, 'Dogwood', 40],
        ['Elm', 50, 'Dogwood', 40],
      ],
    );
    expect(order(made)).toEqual(['Elm', 'Ash', 'Birch', 'Cedar', 'Dogwood']);
    expect(sharedNote(made, ['Ash', 'Birch', 'Cedar'])).toBe(
      'Ash, Birch, and Cedar are level on win percentage (.500). In the games among these three: Ash 2–0, Birch 1–1, Cedar 0–2.',
    );
  });

  it('case 33: two never met, head-to-head counts and leaves all three level, point difference orders them', async () => {
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar'],
      [
        ['Ash', 50, 'Cedar', 45],
        ['Cedar', 50, 'Ash', 45],
        ['Birch', 41, 'Cedar', 40],
        ['Cedar', 50, 'Birch', 40],
      ],
    );
    expect(order(made)).toEqual(['Cedar', 'Ash', 'Birch']);
    expect(sharedNote(made, ['Cedar', 'Ash', 'Birch'])).toBe(
      'Cedar, Ash, and Birch are level on win percentage (.500). In the games among these three: Cedar 2–2, Ash 1–1, Birch 1–1. By point difference: Cedar +9, Ash 0, Birch -9.',
    );
  });

  it('says who has played none of the others when head-to-head cannot count', async () => {
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar', 'Dogwood', 'Elm'],
      [
        ['Ash', 50, 'Birch', 40],
        ['Birch', 50, 'Ash', 45],
        ['Cedar', 50, 'Dogwood', 40],
        ['Elm', 60, 'Cedar', 40],
      ],
    );
    expect(order(made)).toEqual(['Elm', 'Ash', 'Birch', 'Cedar', 'Dogwood']);
    expect(sharedNote(made, ['Ash', 'Birch', 'Cedar'])).toBe(
      'Ash, Birch, and Cedar are level on win percentage (.500). Head-to-head does not count here: Cedar has played none of the others. By point difference: Ash +5, Birch -5, Cedar -10.',
    );
  });

  it('in a points table gives the records with their ties', async () => {
    const rules: SeasonRules = {
      ...defaultSeasonRules(),
      // Three points a win, one a tie.
      standings: {
        ...defaultSeasonRules().standings,
        rankBy: 'points',
        pointsPerWin: 3,
        columns: [...defaultSeasonRules().standings.columns, 'points'],
      },
      allowTies: true,
    };
    const made = await tableAfter(
      ['Ash', 'Birch', 'Cedar', 'Zed'],
      [
        ['Ash', 40, 'Birch', 40],
        ['Cedar', 50, 'Ash', 45],
        ['Birch', 40, 'Cedar', 40],
        ['Ash', 50, 'Zed', 40],
        ['Birch', 30, 'Zed', 30],
        ['Zed', 35, 'Birch', 35],
      ],
      { rules },
    );
    expect(order(made)).toEqual(['Cedar', 'Birch', 'Ash', 'Zed']);
    expect(sharedNote(made, ['Cedar', 'Birch', 'Ash'])).toBe(
      'Cedar, Birch, and Ash are level on points (4). In the games among these three (2 games each): Cedar 4 points, Birch 2, Ash 1.',
    );
  });

  it('in a points table gives the points per game head-to-head compared (the fix round’s F1)', async () => {
    const rules: SeasonRules = {
      ...defaultSeasonRules(),
      standings: {
        ...defaultSeasonRules().standings,
        rankBy: 'points',
        pointsPerWin: 3,
        columns: [...defaultSeasonRules().standings.columns, 'points'],
      },
    };
    const made = await tableAfter(
      ['A', 'B', 'C', 'X'],
      [
        ['A', 50, 'C', 40],
        ['A', 50, 'C', 40],
        ['B', 50, 'A', 40],
        ['B', 50, 'X', 40],
        ['C', 50, 'X', 40],
        ['C', 50, 'X', 40],
      ],
      { rules },
    );
    expect(order(made)).toEqual(['B', 'A', 'C', 'X']);
    expect(sharedNote(made, ['B', 'A', 'C'])).toBe(
      'B, A, and C are level on points (6). In the games among these three, by points per game: B 3 from 1 game, A 6 from 3, C 0 from 2.',
    );
    // The home page keeps only the first sentence, unchanged.
    expect(made.view.briefFootnotes.map((note) => note.text)).toContain(
      'B, A, and C are level on points (6).',
    );
  });

  it('says when teams that start again are still level between themselves (the fix round’s F2)', async () => {
    const made = await tableAfter(
      ['A', 'B', 'C', 'X', 'Y'],
      [
        ['A', 50, 'B', 40],
        ['A', 50, 'C', 40],
        ['B', 50, 'C', 40],
        ['C', 52, 'B', 40],
        ['X', 50, 'A', 40],
        ['X', 50, 'A', 40],
        ['B', 50, 'Y', 30],
        ['C', 50, 'Y', 40],
      ],
    );
    expect(sharedNote(made, ['A', 'B', 'C'])).toBe(
      'A, B, and C are level on win percentage (.500). In the games among these three: A 2–0, B 1–2, C 1–2. B and C split their games with each other (1–1). Point difference puts B ahead of C: +8 against +2.',
    );
  });

  it('names fewest points allowed and a coin flip among three with each team', async () => {
    const circle: readonly Game[] = [
      ['Ash', 40, 'Cedar', 30],
      ['Cedar', 50, 'Birch', 45],
      ['Birch', 45, 'Ash', 44],
    ];
    const allowed = await tableAfter(['Ash', 'Birch', 'Cedar'], circle, {
      rules: { ...defaultSeasonRules(), tiebreakers: ['fewest-points-allowed'] },
    });
    expect(sharedNote(allowed, ['Ash', 'Cedar', 'Birch'])).toBe(
      'Ash, Cedar, and Birch are level on win percentage (.500). By fewest points allowed: Ash 75, Cedar 85, Birch 94.',
    );
    const flipped = await tableAfter(['Ash', 'Birch', 'Cedar'], circle, {
      rules: { ...defaultSeasonRules(), tiebreakers: ['coin-flip'] },
      coinFlips: [['Cedar', 'Ash', 'Birch']],
    });
    expect(sharedNote(flipped, ['Cedar', 'Ash', 'Birch'])).toBe(
      'Cedar, Ash, and Birch are level on win percentage (.500). A coin flip puts them in this order: Cedar, Ash, Birch.',
    );
  });

  it('teams that have played nobody, ordered by a recorded flip: the note says the flip did it', async () => {
    const rules = { ...defaultSeasonRules(), tiebreakers: ['head-to-head', 'coin-flip'] as const };
    const two = await tableAfter(['Ash', 'Birch'], [], { rules, coinFlips: [['Birch', 'Ash']] });
    expect(order(two)).toEqual(['Birch', 'Ash']);
    const pair = 'Birch and Ash have not played yet. A coin flip puts Birch ahead of Ash.';
    for (const team of ['Birch', 'Ash']) expect(levelNoteBeside(two, team)).toBe(pair);
    const three = await tableAfter(['Ash', 'Birch', 'Cedar'], [], {
      rules,
      coinFlips: [['Cedar', 'Ash', 'Birch']],
    });
    expect(order(three)).toEqual(['Cedar', 'Ash', 'Birch']);
    expect(levelNoteBeside(three, 'Ash')).toBe(
      'Cedar, Ash, and Birch have not played yet. A coin flip puts them in this order: Cedar, Ash, Birch.',
    );
  });
});

// The lead's answer (a) to step 2.198: the home page's small table keeps each level note's
// first sentence, who is level and on what; the standings page keeps the whole note.
describe('the home page’s form of each note', () => {
  /** The home page's note beside a team, beside its standings-page note. */
  function bothBeside({ view }: Made, team: string): { brief: string[]; whole: string[] } {
    const row = view.rows.find((r) => r.team === team);
    if (row === undefined) throw new Error(`no row for ${team}`);
    const text = (notes: StandingsTableView['footnotes'], id: string) =>
      (notes.find((f) => f.id === id)?.text ?? '').replaceAll(joiner, '');
    return {
      brief: (row.notes ?? []).map((id) => text(view.briefFootnotes, id)),
      whole: (row.notes ?? []).map((id) => text(view.footnotes, id)),
    };
  }

  /** Every team's home note is its whole note's start and names the team it stands by. */
  function trueBesideEach(made: Made): void {
    expect(made.view.briefFootnotes.map((f) => f.id)).toEqual(made.view.footnotes.map((f) => f.id));
    for (const row of made.view.rows) {
      const { brief, whole } = bothBeside(made, row.team);
      brief.forEach((note, n) => {
        expect(whole[n]?.startsWith(note)).toBe(true);
        if (note.includes(' level on ')) expect(note).toContain(row.team);
      });
    }
  }

  it('four level (case 46): the home page says who is level and on what; the standings page the whole note', async () => {
    const made = await tableAfter(
      ['Otters', 'Badgers', 'Lions', 'Tigers', 'Hawks', 'Bears'],
      [
        ['Tigers', 55, 'Hawks', 48],
        ['Bears', 60, 'Badgers', 52],
        ['Hawks', 51, 'Tigers', 47],
        ['Otters', 58, 'Lions', 49],
        ['Lions', 50, 'Bears', 44],
      ],
    );
    for (const team of ['Lions', 'Tigers', 'Hawks', 'Bears']) {
      expect(bothBeside(made, team)).toEqual({
        brief: ['Lions, Tigers, Hawks, and Bears are level on win percentage (.500).'],
        whole: [
          'Lions, Tigers, Hawks, and Bears are level on win percentage (.500). In the games among these four: Lions 1–0, Tigers 1–1, Hawks 1–1, Bears 0–1. Tigers and Hawks split their games with each other (1–1). Point difference puts Tigers ahead of Hawks: +3 against -3.',
        ],
      });
    }
    trueBesideEach(made);
  });

  it('two level (case 7): the first sentence on the home page, the reason on the standings page', async () => {
    const made = await tableAfter(['Ravens', 'Wolves'], [game1, game2]);
    expect(bothBeside(made, 'Ravens')).toEqual({
      brief: ['Wolves and Ravens are level on win percentage (.500).'],
      whole: [
        'Wolves and Ravens are level on win percentage (.500). Point difference puts Wolves ahead: +4 against -4.',
      ],
    });
    trueBesideEach(made);
  });

  it('every other case keeps a note true beside each team: in the bin, not played, two still level, points', async () => {
    const binned = await tableAfter(
      ['Otters', 'Badgers', 'Lions', 'Tigers', 'Hawks', 'Bears'],
      [
        ['Tigers', 55, 'Hawks', 48],
        ['Bears', 60, 'Badgers', 52],
        ['Hawks', 51, 'Tigers', 47],
        ['Otters', 58, 'Lions', 49],
        ['Lions', 50, 'Bears', 44],
      ],
      { binned: ['Bears'] },
    );
    expect(bothBeside(binned, 'Hawks').brief).toEqual([
      'Lions, Tigers, and Hawks are level on win percentage (.500).',
    ]);
    trueBesideEach(binned);
    const reader = await tableAfter(
      ['A', 'B', 'C', 'D', 'E', 'F'],
      [
        ['A', 60, 'B', 55],
        ['E', 51, 'A', 50],
        ['D', 45, 'C', 40],
        ['E', 41, 'D', 40],
        ['B', 80, 'F', 60],
        ['C', 50, 'F', 45],
      ],
    );
    trueBesideEach(reader);
    const idle = await tableAfter(['Wolves', 'Ravens', 'Hawks'], [game1]);
    trueBesideEach(idle);
    const points = await tableAfter(
      ['Ash', 'Birch', 'Cedar'],
      [
        ['Ash', 40, 'Cedar', 30],
        ['Cedar', 50, 'Birch', 45],
        ['Birch', 45, 'Ash', 44],
      ],
      {
        rules: {
          ...defaultSeasonRules(),
          standings: {
            ...defaultSeasonRules().standings,
            rankBy: 'points',
            pointsPerWin: 3,
            columns: [...defaultSeasonRules().standings.columns, 'points'],
          },
        },
      },
    );
    trueBesideEach(points);
  });
});
