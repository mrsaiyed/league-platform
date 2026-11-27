// The teams list, a team's page and the members' start page (step 2.44), on the made-up
// stand-in leagues: records and seeds, rosters through the one name function, statistics
// following each team's setting, and who lands where.
import {
  archiveSeason,
  createTeam,
  defaultNamePolicy,
  publicRosterLine,
  publicViewer,
  type AccessHolder,
} from '@srleagues/core';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { standInPublicSchedule } from '../../server/stand-in-public-schedule.ts';
import { standInPublicStats } from '../../server/stand-in-public-stats.ts';
import { standInPublicTeams } from '../../server/stand-in-public-teams.ts';
import { startingNamePolicy } from '../../server/name-policy-of.ts';
import { standInPeople } from '../../server/stand-in-ports.ts';
import { newTeamInput } from '../teams-area/form-input.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import { myTeamSlugOf } from '../../server/my-team-cookie.ts';
import {
  buildRoster,
  buildTeamGames,
  loadTeamCards,
  loadTeamHead,
  loadTeamStats,
} from './build-team.ts';
import { chooseMyTeam, leagueHomeStayUrl, teamIdsFromGrants } from './start-page.ts';
import { staffNumbersAddress } from '../staff-numbers/index.ts';
import {
  resultsBesideRoster,
  RosterSections,
  TeamStatsPart,
  TeamStatsSection,
} from './team-page.tsx';
import { TeamCards } from './teams-page.tsx';

const adult = '01900000-0000-7000-8000-000000000001';
const youth = '01900000-0000-7000-8000-000000000002';
const member = '01900000-0000-7000-8000-0000000000a3';
const now = () => new Date('2026-11-13T15:00:00Z');
const world = testWorld(undefined, now);
const stats = standInPublicStats(world, startingNamePolicy);
const schedules = standInPublicSchedule(world);
const teams = standInPublicTeams(world);
const addressee = { id: adult, slug: 'north-valley', customDomain: null } as never;

async function season(leagueId: string, index = 0) {
  const found = (await stats.seasonsOf(leagueId))[index];
  if (found === undefined) throw new Error('no season');
  return found;
}

describe('the teams list', () => {
  it('lists every team with its record and seed, by division', async () => {
    const s = await season(adult);
    const cards = await loadTeamCards(stats.readStoreOf(adult), addressee, s, s.isCurrent);
    // East, then West, each in its standings order.
    expect(cards?.map((c) => c.name)).toEqual([
      'Owls',
      'Falcons',
      'Herons',
      'Otters',
      'Lions',
      'Tigers',
      'Hawks',
      'Bears',
      'Badgers',
    ]);
    const owls = cards?.[0];
    // Two wins and a loss, ahead of the Falcons (also 2-1) by the game between them.
    expect(owls?.recordText).toBe('2-1');
    expect(owls?.seedText).toBe('1');
    expect(owls?.divisionName).toBe('East');
    expect(owls?.href).toBe('/north-valley/teams/owls');
  });

  it('a past season keeps its season in the address, and a team with no place has no seed', async () => {
    const past = await season(adult, 1);
    // A team added to the season after its last result has no place in its standings yet
    // (in a world of its own, so the other cases keep theirs as seeded). An archived
    // season is read-only (O-12, T-390), so the team joins while the season still runs
    // and the season is archived after.
    let version = 0;
    const own = testWorld(undefined, now, (leagues) => {
      const seasons = leagues.find((l) => l.leagueId === adult)?.seasons ?? [];
      const at = seasons.findIndex((x) => x.id === past.id);
      const running = seasons[at];
      if (running === undefined) throw new Error('no past season');
      seasons[at] = { ...running, status: 'active' };
      version = running.version;
    });
    const owner = { leagueId: adult, accountId: standInPeople.owner.accountId, requestId: 'r1' };
    const added = await createTeam(
      owner,
      newTeamInput({ name: 'Owls', useOwnColors: 'on' }, past.id),
      own.deps,
    );
    expect(added.ok).toBe(true);
    const archived = await archiveSeason(
      { ...owner, requestId: 'r2' },
      { seasonId: past.id, version },
      own.deps,
    );
    expect(archived.ok).toBe(true);
    const late = await createTeam(
      { ...owner, requestId: 'r3' },
      newTeamInput({ name: 'Kites', useOwnColors: 'on' }, past.id),
      own.deps,
    );
    expect(late).toEqual({ ok: false, error: { code: 'season-archived' } });
    const store = standInPublicStats(own, startingNamePolicy).readStoreOf(adult);
    const cards = await loadTeamCards(store, addressee, past, past.isCurrent);
    expect(cards?.every((c) => c.href.endsWith('?season=spring-2026'))).toBe(true);
    expect(cards?.find((c) => c.slug === 'owls')?.seedText).toBe('Not seeded yet');
  });
});

describe('the team cards', () => {
  const card = (slug: string, divisionName: string | null) => ({
    slug,
    name: slug,
    color: null,
    href: `/x/teams/${slug}`,
    seedText: '1',
    recordText: '1-0',
    divisionName,
    left: false,
  });
  const html = (cards: Parameters<typeof TeamCards>[0]['cards']) =>
    renderToStaticMarkup(createElement(TeamCards, { cards }));

  it('mark a team that has left the league, and only that one (S-87)', () => {
    const text = html([{ ...card('comets', null), left: true }, card('rockets', null)]);
    expect(text).toContain('data-team-left="comets"');
    expect(text).not.toContain('data-team-left="rockets"');
    expect(text).toContain('Left the league');
  });

  it('say nothing about divisions in a league that has none', () => {
    const text = html([card('comets', null), card('rockets', null)]);
    expect(text).not.toContain('Division');
    expect(text).not.toContain('No division');
    expect(text).toContain('Seed');
  });

  it('say which team has no division in a league that has them', () => {
    const text = html([card('owls', 'East'), card('strays', null)]);
    expect(text.match(/<dt>Division<\/dt>/g)).toHaveLength(2);
    expect(text).toContain('East');
    expect(text).toContain('No division');
  });

  it('are headed at level two: the page has its title, then its teams, with no level skipped', () => {
    const text = html([card('owls', 'East'), card('strays', null)]);
    expect(text.match(/<h2 class="ui-team-card-name">/g)).toHaveLength(2);
    expect(text).not.toMatch(/<h[3-6]/);
  });

  it('group the cards under each division’s small label, as the standings are, only where there are divisions', () => {
    const text = html([card('owls', 'East'), card('herons', 'East'), card('otters', 'West')]);
    // One list for each division, named by its label; the cards stand upright from a tablet up.
    expect(text.match(/<ul class="ui-card-grid" data-layout="teams"/g)).toHaveLength(2);
    expect(text).toContain('<p class="ui-eyebrow" id="teams-division-1" dir="auto">East</p>');
    expect(text).toContain('aria-labelledby="teams-division-2"');
    expect(text.indexOf('/x/teams/herons')).toBeLessThan(text.indexOf('>West</p>'));
    expect(text.indexOf('>West</p>')).toBeLessThan(text.indexOf('/x/teams/otters'));
    // Every card says what it leads to at its foot.
    expect(
      text.match(/<span class="ui-team-card-way" aria-hidden="true">Roster<\/span>/g),
    ).toHaveLength(3);
    // A league with no divisions is one list with no label.
    const plain = html([card('comets', null), card('rockets', null)]);
    expect(
      plain.match(/<ul class="ui-card-grid" data-layout="teams" aria-label="Teams">/g),
    ).toHaveLength(1);
    expect(plain).not.toContain('ui-eyebrow');
  });

  it("a team's page puts its games before its roster, in the page and on the screen", () => {
    const page = readFileSync(new URL('./team-page.tsx', import.meta.url), 'utf8');
    expect(page.indexOf('className="team-games"')).toBeGreaterThan(-1);
    expect(page.indexOf('className="team-games"')).toBeLessThan(
      page.indexOf('className="team-roster"'),
    );
    // The stylesheet places nothing against that order: the keyboard goes as the eye does.
    const css = readFileSync(
      new URL('../../app/[league]/league-site.css', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/\.team-(games|roster)\b[^{]*\{[^}]*(grid-(row|column)|order):/);
    expect(css).not.toMatch(/(^|[\s;{])order:\s*-/m);
  });

  it('the stand-in league without divisions has none on its cards', async () => {
    const s = await season(youth);
    const cards = await loadTeamCards(
      stats.readStoreOf(youth),
      { id: youth, slug: 'harbor-city', customDomain: null } as never,
      s,
      s.isCurrent,
    );
    expect(cards?.length).toBeGreaterThan(0);
    expect(html(cards ?? [])).not.toContain('Division');
  });
});

describe('a team page', () => {
  it('has the team, its record and its roster with those who left apart', async () => {
    const s = await season(adult);
    const head = await loadTeamHead(stats.readStoreOf(adult), adult, s.id, 'falcons');
    expect(head?.team.name).toBe('Falcons');
    expect(head?.seedText).toBe('Seed 2');
    // The seed alone, for the row of facts under the team's name.
    expect(head?.seedValue).toBe('2');
    expect(head?.team.divisionName).toBe('East');
    // Beat the Herons and the Badgers, lost to the Owls: its three results.
    expect(head?.recordText).toBe('2-1');
    const roster = buildRoster(
      await stats.statisticsOf(adult, ({ rosterOf }) =>
        rosterOf(head?.teamId ?? '', publicViewer(adult)),
      ),
    );
    expect(roster.current.map((r) => r.name)).toContain('Dana Whitfield');
    // A person who asked to be taken off the public pages is a nameless entry (R-17).
    expect(roster.current.map((r) => r.name)).toContain('Name not shown');
    expect(roster.current.some((r) => r.name.includes('Fontaine'))).toBe(false);
    expect(roster.former.map((r) => r.name.startsWith('Pat'))).toEqual([true]);
    expect(roster.former[0]?.name).toContain('(left ');
  });

  it('shows a youth team by number only where the league hides names (R-24)', async () => {
    const s = await season(youth);
    const head = await loadTeamHead(stats.readStoreOf(youth), youth, s.id, 'rockets');
    // The youth league's own setting says hidden: the roster reads it itself.
    const policy = { ...(await stats.settingsOf(youth)).namePolicy, names: 'hidden' as const };
    const hiding = standInPublicStats(world, async (leagueId) =>
      leagueId === youth ? policy : startingNamePolicy(leagueId),
    );
    const roster = buildRoster(
      await hiding.statisticsOf(youth, ({ rosterOf }) =>
        rosterOf(head?.teamId ?? '', publicViewer(youth)),
      ),
    );
    // The players by number; since step 2.162 hidden is followed for adults too (R-29), so
    // their coach, a grown-up with no number, is a nameless entry.
    // The number is printed once, in the number column: never again as the name (2.146).
    expect(roster.current.map((r) => [r.number, r.name])).toEqual([
      ['6', 'Name not shown'],
      ['13', 'Name not shown'],
      ['', 'Name not shown'],
    ]);
    expect(roster.former.map((r) => [r.number, r.name])).toEqual([
      ['1', expect.stringMatching(/^Name not shown \(left /)],
    ]);
    expect(JSON.stringify(roster)).not.toMatch(/#\d/);
    expect(JSON.stringify(roster)).not.toMatch(/Noor|Haddad|Jay|Whitaker|Tess|Moreno|Lena|Ortiz/);
  });

  it('shows a player added at the scorer’s table by number only by that number, once (S-34)', () => {
    const line = (entryId: string, jerseyNumber: string | null, firstName = '') =>
      publicRosterLine(
        {
          entryId,
          jerseyNumber,
          role: 'player',
          leftOn: null,
          firstName,
          lastName: '',
          isMinor: null,
          nameRequest: 'none',
          personBinned: false,
        },
        'adult',
        { viewer: publicViewer(adult), policy: defaultNamePolicy },
      );
    const roster = buildRoster({
      lines: [line('a', '12'), line('b', '7', 'Yusuf'), line('c', null)],
    });
    expect(roster.current.map((r) => [r.number, r.name])).toEqual([
      ['12', 'Name not shown'],
      ['7', 'Yusuf'],
      // No name and no number cannot be added at the table; were it there, it is nameless.
      ['', 'Name not shown'],
    ]);
    // Each row's key is its place in the page's roster, never the roster place's id.
    expect(roster.current.map((r) => r.key)).toEqual(['roster-0', 'roster-1', 'roster-2']);
  });

  it('draws a dash with its word, the shared piece, for someone on the roster with no number', () => {
    const text = renderToStaticMarkup(
      createElement(RosterSections, {
        roster: {
          current: [
            { key: 'a', number: '12', name: 'Dana', role: 'Player', former: false },
            { key: 'b', number: '', name: 'Sam', role: 'Coach', former: false },
          ],
          former: [],
        },
      }),
    );
    expect(text).toContain('<td class="ui-num">12</td>');
    expect(text).toContain(
      '<td class="ui-num"><span class="ui-no-value" aria-hidden="true">–</span><span class="ui-visually-hidden">No number</span></td>',
    );
  });

  it('is not there for a team of another season', async () => {
    const s = await season(youth);
    expect(await loadTeamHead(stats.readStoreOf(youth), youth, s.id, 'falcons')).toBeUndefined();
  });

  it('sets up the staff request only on a hidden team page that shows totals (step 2.46)', async () => {
    const s = await season(adult);
    const store = stats.readStoreOf(adult);
    const settings = await stats.settingsOf(adult);
    /** What the page sends a visitor for the part: the props a client part is given. */
    const sent = async (slug: string) => {
      const head = await loadTeamHead(store, adult, s.id, slug);
      const teamId = head?.teamId ?? '';
      const team = await loadTeamStats(store, settings, {
        leagueId: adult,
        seasonId: s.id,
        teamId,
      });
      expect(team?.playerLinesShown, slug).toBe(false);
      const staffAddress = staffNumbersAddress(
        { id: adult },
        { page: 'team', season: s.id, team: teamId },
      );
      const part = team === undefined ? null : TeamStatsPart({ stats: team, staffAddress });
      return { text: JSON.stringify(part), staffAddress };
    };
    // The Owls keep their players back and have totals: the request is set up.
    const owls = await sent('owls');
    expect(owls.text).toContain(owls.staffAddress);
    // The Bears keep theirs back too but have nothing recorded: no trace of the request,
    // not its address, not the staff-numbers endpoint at all.
    const bears = await sent('bears');
    expect(bears.text).not.toContain(bears.staffAddress);
    expect(bears.text).not.toContain('staff-numbers');
    expect(owls.text).toContain('staff-numbers');
  });

  it('shows only the totals of a team whose players numbers are staff only (S-22)', async () => {
    const s = await season(adult);
    const store = stats.readStoreOf(adult);
    const settings = await stats.settingsOf(adult);
    const owls = await loadTeamHead(store, adult, s.id, 'owls');
    expect(owls?.statsShown).toBe('team_totals');
    const hidden = await loadTeamStats(store, settings, {
      leagueId: adult,
      seasonId: s.id,
      teamId: owls?.teamId ?? '',
    });
    expect(hidden?.playerLinesShown).toBe(false);
    expect(hidden?.playerRows).toEqual([]);
    expect(hidden?.totalsRows).toHaveLength(1);
    // The totals row names the team under a plain "Team" heading, with the team's own color.
    expect(hidden?.totalsColumns[0]?.label).toBe('Team');
    expect(hidden?.totalsRows[0]?.cells['team']).toBe('Owls');
    expect(hidden?.totalsRows[0]?.chips?.['team']).toBe(owls?.team.color);
    // An opaque key, not the team's database id.
    expect(hidden?.totalsRows[0]?.id).toBe('team-totals');
    expect(owls?.team.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(JSON.stringify(hidden)).not.toContain('Castellanos');
    const falcons = await loadTeamHead(store, adult, s.id, 'falcons');
    const shown = await loadTeamStats(store, settings, {
      leagueId: adult,
      seasonId: s.id,
      teamId: falcons?.teamId ?? '',
    });
    expect(shown?.playerRows.map((r) => r.cells['player'])).toEqual(
      expect.arrayContaining(['Dana Whitfield', 'Marcus Oyelaran']),
    );
    // On the page a few totals are a strip of big numbers under "Team totals", not a table
    // of one row; a team whose players are hidden says so under the strip, and names none.
    if (hidden === undefined || shown === undefined) throw new Error('no statistics');
    const hiddenText = renderToStaticMarkup(createElement(TeamStatsSection, { stats: hidden }));
    expect(hiddenText).toContain('<p class="ui-eyebrow">Team totals</p>');
    expect(hiddenText).toMatch(/<dt>Points<\/dt><dd>155<\/dd>/);
    expect(hiddenText).toContain('Only this team&#x27;s totals are shown');
    expect(hiddenText).not.toContain('<table');
    expect(hiddenText).not.toContain('Castellanos');
    // Where the players are shown, their table stands beside the strip and opens sorted by
    // points, biggest first.
    const shownText = renderToStaticMarkup(createElement(TeamStatsSection, { stats: shown }));
    expect(shownText).toContain('<div class="team-stats" data-layout="pair">');
    expect(shownText).toContain('Team totals');
    expect(shownText.match(/aria-sort="descending"/g)).toHaveLength(1);
    expect(shownText.indexOf('Dana Whitfield')).toBeLessThan(shownText.indexOf('Marcus Oyelaran'));
    expect(shownText).not.toContain('Only this team');
    // Many statistics are the same strip, wrapping onto a second line: never a table of one
    // row across the page, at any count (the code review of step 2.147 part 3).
    const withTotals = (base: typeof hidden, keys: string) => {
      const many = [...keys].map((key) => ({ key, label: key, numeric: true }));
      return {
        ...base,
        totalsColumns: [{ key: 'team', label: 'Team' }, ...many],
        totalsRows: [
          {
            id: 't',
            cells: { team: 'Owls', ...Object.fromEntries(many.map((c) => [c.key, '1'])) },
          },
        ],
      };
    };
    const wide = renderToStaticMarkup(
      createElement(TeamStatsSection, { stats: withTotals(hidden, 'abcde') }),
    );
    expect(wide).not.toContain('<table');
    expect(wide).toContain('<p class="ui-eyebrow">Team totals</p>');
    expect(wide).toContain('<dl class="ui-stat-strip" data-wrap="true"');
    expect(wide.match(/<dt>/g)).toHaveLength(5);
    expect(wide).toContain('Only this team');
  });

  it('draws seven totals as one strip on two lines, over the players at the page’s width', async () => {
    const s = await season(adult);
    const store = stats.readStoreOf(adult);
    const settings = await stats.settingsOf(adult);
    const falcons = await loadTeamHead(store, adult, s.id, 'falcons');
    const shown = await loadTeamStats(store, settings, {
      leagueId: adult,
      seasonId: s.id,
      teamId: falcons?.teamId ?? '',
    });
    if (shown === undefined) throw new Error('no statistics');
    const seven = [...'abcdefg'].map((key) => ({ key, label: key, numeric: true }));
    const text = renderToStaticMarkup(
      createElement(TeamStatsSection, {
        stats: {
          ...shown,
          totalsColumns: [{ key: 'team', label: 'Team' }, ...seven],
          totalsRows: [
            {
              id: 't',
              cells: {
                team: 'Falcons',
                ...Object.fromEntries(seven.map((c, n) => [c.key, String(n + 1)])),
              },
            },
          ],
        },
      }),
    );
    // Four and three on a phone and on a laptop: one strip, every number in it.
    expect(text).toContain(
      '<dl class="ui-stat-strip" data-wrap="true" style="--ui-stat-across:4;--ui-stat-across-wide:4">',
    );
    expect(text.match(/<dt>/g)).toHaveLength(7);
    expect(text).toMatch(/<dt>g<\/dt><dd>7<\/dd>/);
    // The only table left is the players', which has more than one row; with so many
    // statistics it stands under the strip, each at the page's width.
    expect(text.match(/<table/g)).toHaveLength(1);
    expect(text).toContain('<div class="team-stats" data-layout="stack">');
    expect(text.indexOf('ui-stat-strip')).toBeLessThan(text.indexOf('<table'));
    expect(text).not.toContain('Only this team');
    // A team with nothing recorded says so in a calm panel, and draws no row of dashes,
    // whether or not its players' numbers are public.
    for (const playerLinesShown of [true, false]) {
      const none = renderToStaticMarkup(
        createElement(TeamStatsSection, {
          stats: {
            ...shown,
            playerLinesShown,
            playerRows: [],
            hasNumbers: false,
            totalsRows: [{ id: 't', cells: { team: 'Falcons', a: null } }],
          },
        }),
      );
      expect(none).toContain('No statistics have been recorded for this team yet.');
      expect(none).not.toContain('<table');
    }
  });

  it('puts the results beside a long roster, and at the page’s width beside a short one', () => {
    // Two roster lines beside two games to come: the results take the width under both.
    expect(resultsBesideRoster({ upcoming: 2, rosterLines: 2 })).toBe(false);
    expect(resultsBesideRoster({ upcoming: 0, rosterLines: 9 })).toBe(false);
    // Twelve players beside one row of games: the results fill the games' column.
    expect(resultsBesideRoster({ upcoming: 2, rosterLines: 12 })).toBe(true);
    expect(resultsBesideRoster({ upcoming: 6, rosterLines: 12 })).toBe(false);
  });

  it('splits one teams games into the ones to play and the results', async () => {
    const s = await season(adult);
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, s.id, clock.today);
    const games = buildTeamGames(schedule, 'falcons', clock, addressee);
    expect(games.results.length).toBeGreaterThan(0);
    expect(games.upcoming.length).toBeGreaterThan(0);
    const everyGame = [...games.results, ...games.upcoming];
    expect(everyGame.every((g) => g.teamSlugs.includes('falcons'))).toBe(true);
    expect(games.results.every((g) => g.status === 'final' || g.status === 'forfeit')).toBe(true);
    expect(buildTeamGames(undefined, 'falcons', clock, addressee)).toEqual({
      upcoming: [],
      results: [],
      awaiting: [],
    });
  });

  it('lists a team its postponed game last, never first on the strength of its old date', async () => {
    const s = await season(adult);
    const clock = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, s.id, clock.today);
    // The Herons have a game postponed two rounds ago and games still to play.
    const statuses = buildTeamGames(schedule, 'herons', clock, addressee).upcoming.map(
      (g) => g.status,
    );
    expect(statuses).toContain('scheduled');
    expect(statuses.at(-1)).toBe('postponed');
    expect(statuses.indexOf('postponed')).toBe(statuses.length - 1);
  });

  it("lists a team its game tonight ahead of one earlier today with no result yet, by the league's clock", async () => {
    const s = await season(adult);
    const real = await schedules.clockOf(adult);
    const schedule = await schedules.scheduleOf(adult, s.id, real.today);
    const base = schedule?.rounds.flatMap((r) => r.games).find((g) => g.homeTeam.slug === 'herons');
    if (schedule === undefined || base === undefined) throw new Error('no game');
    // 9:30 in the evening of the 13th in Chicago; already the 14th by UTC.
    const clock = {
      today: '2026-11-13',
      now: '2026-11-14T03:30:00.000Z',
      timeZone: 'America/Chicago',
    };
    const game = (id: string, startsAt: string) => ({
      ...base,
      id,
      status: 'scheduled',
      startsAt,
      localDate: '2026-11-13',
      homeScore: null,
      awayScore: null,
    });
    const changed = {
      ...schedule,
      rounds: [],
      unplacedGames: [
        game('earlier-today', '2026-11-14T01:00:00.000Z'),
        game('tonight', '2026-11-14T04:00:00.000Z'),
      ],
    };
    // The game earlier today with no score is not on the schedule after tonight's: it waits
    // apart, in its own list, with the same pill as its own page (step 2.159).
    const games = buildTeamGames(changed, 'herons', clock, addressee);
    expect(games.upcoming.map((g) => g.id)).toEqual(['tonight']);
    expect(games.awaiting.map((g) => [g.id, g.pill])).toEqual([
      ['earlier-today', 'Awaiting score'],
    ]);
    expect(games.results).toEqual([]);
  });
});

describe('the start page', () => {
  it('has its two settings in the two stand-in leagues', async () => {
    expect(await teams.startPageOf(adult)).toBe('leagueHome');
    expect(await teams.startPageOf(youth)).toBe('myTeam');
  });

  const list = [
    { id: 'a', slug: 'bears', name: 'Bears' },
    { id: 'b', slug: 'ants', name: 'Ants' },
  ];

  it('a signed-in member lands on their own team before the one the device remembers', () => {
    expect(
      chooseMyTeam({ teams: list, grantTeamIds: [], rosterTeamIds: ['a'], rememberedSlug: 'ants' }),
    ).toBe('bears');
    expect(
      chooseMyTeam({
        teams: list,
        grantTeamIds: ['b', 'A'],
        rosterTeamIds: [],
        rememberedSlug: undefined,
      }),
    ).toBe('ants');
  });

  it('a visitor lands on the remembered team, and on none that is not in the season', () => {
    const none = { grantTeamIds: [], rosterTeamIds: [] } as const;
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: 'ants' })).toBe('ants');
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: 'gone' })).toBeUndefined();
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: '../x' })).toBeUndefined();
    expect(chooseMyTeam({ ...none, teams: list, rememberedSlug: undefined })).toBeUndefined();
    expect(
      chooseMyTeam({
        teams: list,
        grantTeamIds: ['binned'],
        rosterTeamIds: [],
        rememberedSlug: undefined,
      }),
    ).toBeUndefined();
  });

  it('reads a coach or captain role on a team from the grants, and nothing else', () => {
    const grant = (role: string, scope: unknown, revokedAt: Date | null = null) =>
      ({ id: 'g', accountId: 'me', role, scope, grantedByAccountId: 'x', revokedAt }) as never;
    const holder: AccessHolder = {
      accountId: 'me',
      isOwner: false,
      grants: [
        grant('coach', { type: 'team', id: 'T1' }),
        grant('captain', { type: 'team', id: 't2' }),
        grant('coach', { type: 'team', id: 't3' }, new Date()),
        grant('coach', { type: 'league' }),
        grant('scheduler', { type: 'team', id: 't4' }),
      ],
    };
    expect(teamIdsFromGrants(holder)).toEqual(['t1', 't2']);
    expect(teamIdsFromGrants(undefined)).toEqual([]);
  });

  it('a roster place links the made-up account to a team, only in the current season', async () => {
    const winter = await season(youth);
    const [rocket] = await teams.teamIdsOfAccount(youth, winter.id, member);
    const store = stats.readStoreOf(youth);
    expect((await store.teams(winter.id)).find((t) => t.id === rocket)?.slug).toBe('rockets');
    expect(await teams.teamIdsOfAccount(youth, winter.id, 'someone-else')).toEqual([]);
  });

  it('the league home that stays is always asked for with its own address', () => {
    expect(leagueHomeStayUrl(addressee)).toBe('/north-valley?start=league');
    expect(leagueHomeStayUrl(addressee, 'spring-2026')).toBe(
      '/north-valley?season=spring-2026&start=league',
    );
    expect(myTeamSlugOf('rockets')).toBe('rockets');
    expect(myTeamSlugOf('Rockets')).toBeUndefined();
  });
});
