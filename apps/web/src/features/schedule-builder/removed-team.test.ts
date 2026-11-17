// A team put in the bin directly in the made-up world with games, as Badgers were before
// A-17 held such a team (step 2.180): every screen names it, none shows its id, and none
// links its name to a page that is not there. Admin → Schedule's grid reads "Badgers
// (removed) at Herons" and offers it for no new game; the public schedule lists its games
// under "Badgers" and its game cards lead to the game only; a game's page leaves out its
// team card; and its results stay in its opponents' records after the standings are
// worked out again, though its own row is not drawn.
import {
  getScheduleDraft,
  readStandings,
  rebuildStandings,
  type TeamRecord,
} from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { standInPeople } from '../../server/stand-in-cast.ts';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInSchedule } from '../../server/stand-in-schedule.ts';
import { worldStandingsRead } from '../../server/stand-in-world-standings.ts';
import type { LeagueWorld } from '../../server/stand-in-world-state.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { loadTeamCardsOf } from '../team-pages/index.ts';
import { buildScheduleView } from '../schedule-pages/build-schedule.ts';
import { RoundSections } from '../schedule-pages/schedule-views.tsx';
import { backToTeamId, backToTeamOf } from './back-to-team.ts';
import { gridTeamName, pageGrid } from './build-grid.ts';

const anId = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The first made-up league with its current season's Badgers put in the bin, and them. */
function worldWithBadgersBinned(bin = true) {
  let league: LeagueWorld | undefined;
  let badgers: TeamRecord | undefined;
  const world = testWorld(undefined, undefined, (leagues) => {
    league = leagues.find((l) => l.slug === 'north-valley');
    if (league === undefined) throw new Error('no first league');
    const found = league.teams.find(
      (t) => t.name === 'Badgers' && t.seasonId === league?.currentSeasonId,
    );
    if (found === undefined) throw new Error('no Badgers');
    badgers = found;
    if (bin) league.teams = league.teams.map((t) => (t === found ? { ...t, binned: true } : t));
  });
  if (league === undefined || badgers === undefined) throw new Error('not made');
  const seasonId = league.currentSeasonId ?? '';
  const context = {
    leagueId: league.leagueId,
    accountId: standInPeople.owner.accountId,
    requestId: 'removed-team',
  };
  return { world, league, badgers, seasonId, context };
}

describe('a team in the bin with games is named on every screen (A-17)', () => {
  it('the grid reads "Badgers (removed) at Herons", never an id, and offers them for no game', async () => {
    const { world, league, badgers, seasonId, context } = worldWithBadgersBinned();
    const ports = standInSchedule(world);
    const teams = await ports.teamsOf(league.leagueId, seasonId);
    expect(teams.find((t) => t.id === badgers.id)).toMatchObject({ removed: true });
    const draft = await getScheduleDraft(context, { seasonId }, ports.deps);
    if (!draft.ok) throw new Error(draft.error.code);
    // The page's own wiring (pageGrid): the grid names every team, the forms offer the rest.
    const { grid, teams: offered } = pageGrid(draft.value, teams, []);
    expect(offered.map((t) => t.id)).not.toContain(badgers.id);
    expect(offered.length).toBe(teams.length - 1);
    const theirs = grid.allGames.filter(
      (g) => g.homeTeamId === badgers.id || g.awayTeamId === badgers.id,
    );
    expect(theirs.length).toBeGreaterThan(0);
    for (const game of theirs) {
      expect([game.homeName, game.awayName]).toContain('Badgers (removed)');
    }
    expect(theirs.map((g) => `${g.awayName} at ${g.homeName}`)).toContain(
      'Badgers (removed) at Herons',
    );
    for (const game of grid.allGames) {
      expect(`${game.homeName} ${game.awayName}`).not.toMatch(anId);
    }
    expect(grid.clashes.map((c) => c.text).join(' ')).not.toMatch(anId);
  });

  it('offers the way back only to a team of the season not in the bin, by an id of its shape', () => {
    const teams = [
      { id: '01900000-0000-7000-8000-0000000a0001', name: 'Kestrels' },
      { id: '01900000-0000-7000-8000-0000000a0002', name: 'Badgers', removed: true },
    ];
    expect(backToTeamOf('01900000-0000-7000-8000-0000000A0001', teams)?.name).toBe('Kestrels');
    expect(backToTeamOf('01900000-0000-7000-8000-0000000a0002', teams)).toBeUndefined();
    expect(backToTeamOf('01900000-0000-7000-8000-0000000a0009', teams)).toBeUndefined();
    expect(backToTeamId('<script>')).toBeUndefined();
    expect(backToTeamId(undefined)).toBeUndefined();
  });

  it('a team the list does not hold is named in words, never by its id', () => {
    expect(gridTeamName([], '01900000-0000-7000-8000-0000a1000004')).toBe(
      'Team not in this season',
    );
    expect(gridTeamName([{ id: 'h', name: 'Herons' }], 'h')).toBe('Herons');
    expect(gridTeamName([{ id: 'b', name: 'Badgers', removed: true }], 'b')).toBe(
      'Badgers (removed)',
    );
  });

  it('the public schedule names them, and its cards lead to games only, never a team page', async () => {
    const { world, league, badgers, seasonId } = worldWithBadgersBinned();
    const schedules = standInPublicSchedule(world);
    const clock = await schedules.clockOf(league.leagueId);
    const schedule = await schedules.scheduleOf(league.leagueId, seasonId, clock.today);
    if (schedule === undefined) throw new Error('no public schedule');
    const addressee = { id: league.leagueId, slug: league.slug, customDomain: null } as never;
    const view = buildScheduleView(schedule, clock, addressee, {});
    const games = view.rounds.flatMap((r) => r.games);
    const theirs = games.filter((g) => g.home.name === 'Badgers' || g.away.name === 'Badgers');
    expect(theirs.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(
      createElement(RoundSections, { leagueId: league.leagueId, rounds: view.rounds }),
    );
    expect(html).toContain('Badgers');
    expect(html).not.toContain(`/teams/${badgers.slug}`);
    expect(html.replace(/href="[^"]*"/g, '').replace(/data-[a-z-]+="[^"]*"/g, '')).not.toMatch(
      anId,
    );
  });

  it("a game's page leaves out their team card, so nothing links to a page that is not there", async () => {
    const { world, league, badgers, seasonId } = worldWithBadgersBinned();
    const herons = league.teams.find((t) => t.name === 'Herons' && t.seasonId === seasonId);
    if (herons === undefined) throw new Error('no Herons');
    const store = worldStandingsRead(() => world.read(league.leagueId));
    const addressee = { id: league.leagueId, slug: league.slug, customDomain: null } as never;
    const season = { id: seasonId, slug: 'fall-2026' };
    const cards = await loadTeamCardsOf(store, addressee, season, true, [badgers.id, herons.id]);
    expect(cards.map((c) => c.name)).toEqual(['Herons']);
  });

  it("their results stay in their opponents' records when the standings are worked out again", async () => {
    const kept = worldWithBadgersBinned(false);
    const binned = worldWithBadgersBinned();
    const tableOf = async (w: typeof kept) => {
      const rebuilt = await rebuildStandings(w.context, { seasonId: w.seasonId }, w.world.deps);
      if (!rebuilt.ok) throw new Error(rebuilt.error.code);
      const store = worldStandingsRead(() => w.world.read(w.league.leagueId));
      const read = await readStandings(store, { seasonId: w.seasonId });
      if (!read.ok) throw new Error('no standings');
      return read.value.tables.flatMap((table) =>
        table.lines.map((line) => [line.team.name, line.wins, line.losses, line.gamesPlayed]),
      );
    };
    const before = await tableOf(kept);
    const after = await tableOf(binned);
    expect(before.map(([name]) => name)).toContain('Badgers');
    // Every other team's record is as it was; only Badgers' own row is not drawn.
    expect(after).toEqual(before.filter(([name]) => name !== 'Badgers'));
  });
});
