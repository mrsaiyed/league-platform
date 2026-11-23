// The T-81 scan through the database-backed ports (step 2.93 part 3, record 070; T4 §7).
// On the made-up database with the seed leagues' seasons under way, an adult league
// (Lakeside, with a child in it) and a youth league (Maple Street, whose players' ages
// are not all known): each public page's data, as the page reads it (the statistics
// page, the home page's leaders, the teams page, each team's page with its roster and
// statistics), is built under every value of the league's names setting, saved by the
// owner through the settings command as League settings saves it, with and without the
// parents' confirmation, and with a player's own request to be taken off. Each time the
// names must be the ones the rules give, read from the league's own audience and
// settings, and no page's data may hold a full name where the policy shortens it, a
// withheld first or last name, any private value (a contact address, a birth date), or
// any person's database id. Then each way a person is shown less or leaves (an adult's
// own request for initials, a team whose statistics are its staff's only, a player who
// left their team, the same person moved to the bin) and a league of mixed ages. A
// league whose audience cannot be read is read as youth by findLeagueAudience (its own
// test); the column admits no other value, so no seed league can be made one.
import {
  findPrivateFields,
  privateValuesOf,
  publicViewer,
  readStatisticsTable,
  setNameRequest,
  setSetting,
  markLeft,
  removePerson,
  setTeamStatsVisibility,
  type Audience,
  type CommandDeps,
  type LeaguesTx,
  type NameRequest,
  type PeopleTx,
  type ShownName,
  type TeamsTx,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HomeLeaders } from '../features/schedule-pages/home-leaders.tsx';
import { homeLeadersOf } from '../features/stats-pages/build-home-leaders.ts';
import { loadStatsPage } from '../features/stats-pages/build-stats.ts';
import { StatsTables } from '../features/stats-pages/stats-page.tsx';
import {
  buildRoster,
  loadTeamCards,
  loadTeamHead,
  loadTeamStats,
} from '../features/team-pages/build-team.ts';
import { databasePublicStats } from './database-public-stats.ts';
import type { PublicStatsPorts } from './public-stats.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let stats: PublicStatsPorts;
let settingsDeps: CommandDeps<LeaguesTx>;
let peopleDeps: CommandDeps<PeopleTx>;
let teamsDeps: CommandDeps<TeamsTx>;

/** Opens a made-up database with the seasons under way, and the ports and commands on it. */
async function open(options: database.MadeUpOptions = {}) {
  made = await database.madeUpDatabase({ ...options, underWay: true });
  db = database.createDatabase(made.source);
  stats = databasePublicStats(database, db);
  const base = (scope: database.LeagueScope) => ({
    jobs: database.jobsStore(scope),
    access: database.accessStore(scope),
    activity: database.activityLogStore(scope),
  });
  settingsDeps = {
    transaction: database.commandTransaction(db, (scope) => ({
      ...base(scope),
      leagues: database.leaguesStore(scope),
      divisions: database.divisionsStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => performance.now(),
  };
  peopleDeps = {
    transaction: database.commandTransaction(db, (scope) => ({
      ...base(scope),
      people: database.peopleStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => performance.now(),
  };
  teamsDeps = {
    transaction: database.commandTransaction(db, (scope) => ({
      ...base(scope),
      teams: database.teamsStore(scope),
    })),
    events: [],
    log: () => {},
    now: () => performance.now(),
  };
}

beforeAll(() => open(), 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

const leagueOf = (slug: string) => {
  const found = made.leagues.find((l) => l.slug === slug);
  const seed = database.seedLeagues.find((l) => l.slug === slug);
  if (found === undefined || seed === undefined) throw new Error(`the seed has no ${slug}`);
  return { ...found, seed };
};

/** Every public page's data that shows a person, read as the pages read it. */
async function pagesOf(slug: string) {
  const { leagueId } = leagueOf(slug);
  const [season] = await stats.seasonsOf(leagueId);
  if (season === undefined) throw new Error(`${slug} has no public season`);
  const input = { leagueId, seasonId: season.id };
  const statsPage = await stats.statisticsOf(leagueId, ({ store, settings }) =>
    loadStatsPage(store, settings, { ...input, by: 'total' }),
  );
  if ('code' in statsPage) throw new Error(statsPage.code);
  // The statistics as the database ports give them to core, and as core gives them back.
  const table = await stats.statisticsOf(leagueId, ({ store, settings }) =>
    readStatisticsTable(store, {
      seasonId: season.id,
      viewing: {
        leagueId,
        viewer: publicViewer(leagueId),
        audience: settings.audience,
        policy: settings.namePolicy,
      },
    }),
  );
  if (!table.ok) throw new Error(table.error.code);
  const leaders = await homeLeadersOf(stats, input);
  const cards = await loadTeamCards(stats.readStoreOf(leagueId), { slug }, season, true);
  const teamPages = [];
  for (const card of cards ?? []) {
    // As the team page reads it: its head, statistics and roster in one snapshot.
    const page = await stats.statisticsOf(leagueId, async ({ store, settings, rosterOf }) => {
      const head = await loadTeamHead(store, leagueId, season.id, card.slug);
      if (head === undefined) throw new Error(`no ${card.slug}`);
      const teamStats = await loadTeamStats(store, settings, { ...input, teamId: head.teamId });
      const roster = await rosterOf(head.teamId, publicViewer(leagueId));
      return { head, teamStats, roster };
    });
    teamPages.push(page);
  }
  return {
    fromPorts: [table.value, leaders, ...teamPages.map((p) => p.roster)] as unknown[],
    pageData: [
      statsPage,
      leaders,
      cards,
      ...teamPages.map(({ head, teamStats, roster }) => ({
        head,
        teamStats,
        roster: buildRoster(roster),
      })),
      // The statistics page and the home page's leaders as they are sent.
      renderToStaticMarkup(createElement(StatsTables, { data: statsPage })),
      renderToStaticMarkup(
        createElement(HomeLeaders, { leaders, placing: 'across', statsHref: '/stats' }),
      ),
    ] as unknown[],
    /** Each player as the statistics page shows them, by points (10, 14, 18 in seed order). */
    byPoints: new Map(
      statsPage.playerRows.map((row) => [Number(row.cells['points']), row.cells['player']]),
    ),
    rosterNames: teamPages
      .flatMap((p) => p.roster.lines)
      .map((line) => (line.name.shown ? line.name.text : null)),
    leaderNames: leaders.map((l) => l.name),
    /** Each team's page as it was read: its head, its statistics and its roster. */
    teamPages,
  };
}

/** What a scan also expects, beyond the names setting and each person's own request. */
type ScanCase = {
  /** Who plays, when the league was told another audience than the seed's. */
  readonly audience?: Audience;
  /** First names of players on a team whose statistics are for its staff only. */
  readonly absentFromStats?: readonly string[];
  /** First names of players who have left their team: still in its history, marked. */
  readonly former?: readonly string[];
};

/**
 * Every person of the league as its owner's list holds them (people not in the bin), read
 * once through the people module's own store and kept, so a person moved to the bin later
 * is still looked for. No public page may hold any of their ids (T-81, record 070).
 */
const peopleKept = new Map<string, readonly { id: string; firstName: string }[]>();
async function peopleOf(slug: string) {
  const known = peopleKept.get(slug);
  if (known !== undefined) return known;
  const { leagueId, ownerAccountId } = leagueOf(slug);
  const people = await peopleDeps.transaction(
    { leagueId, accountId: ownerAccountId, requestId: 'scan' },
    (tx) => tx.people.list({ limit: 1000, offset: 0, sensitive: false }),
  );
  const kept = people.map((p) => ({ id: p.id, firstName: p.firstName }));
  peopleKept.set(slug, kept);
  return kept;
}

/**
 * The id of every roster place on the league's teams, as the teams module's own store lists
 * them, kept as they are found, so a place whose person went to the bin is still looked for.
 */
const entriesKept = new Map<string, Set<string>>();
async function rosterEntriesOf(slug: string, teamIds: readonly string[]) {
  const kept = entriesKept.get(slug) ?? new Set<string>();
  entriesKept.set(slug, kept);
  const { leagueId, ownerAccountId } = leagueOf(slug);
  await teamsDeps.transaction({ leagueId, accountId: ownerAccountId, requestId: 'scan' }, (tx) =>
    Promise.all(
      teamIds.map(async (teamId) => {
        for (const line of await tx.teams.listRoster(teamId)) kept.add(line.id);
      }),
    ),
  );
  return [...kept];
}

/** The person ids found in a page's data or its HTML, in any capitals. */
const personIdsIn = (data: unknown, ids: readonly string[]) => {
  const text = (typeof data === 'string' ? data : JSON.stringify(data)).toLowerCase();
  return ids.filter((id) => text.includes(id.toLowerCase()));
};

/** Saves a league setting as its owner, through the settings command (League settings). */
const versions = new Map<string, number>();
async function save(slug: string, key: string, value: unknown, confirmed?: boolean) {
  const { leagueId, ownerAccountId, seed } = leagueOf(slug);
  const known = `${leagueId}/${key}`;
  // A youth or mixed seed league saved "Names on public pages" once, as it starts, so it
  // could be published (step 2.240): the first save here follows that one.
  const seeded = key === 'privacy.publicNames' && seed.audience !== 'adult' ? 1 : null;
  const saved = await setSetting(
    { leagueId, accountId: ownerAccountId, requestId: 'scan' },
    {
      level: 'league',
      key,
      value,
      version: versions.get(known) ?? seeded,
      ...(confirmed === undefined ? {} : { confirmed }),
    },
    settingsDeps,
  );
  if (!saved.ok) throw new Error(`not saved: ${saved.error.code}`);
  versions.set(known, saved.value.version);
}

/** The rules in plain words (R-14, R-15, R-24, R-29), apart from the name function. */
type Setting = 'start' | 'fullConfirmed' | 'initial' | 'hidden';
function expected(
  person: { firstName: string; lastName: string; isMinor?: boolean },
  audience: string,
  setting: Setting,
  request: NameRequest,
): ShownName {
  const child = person.isMinor ?? audience !== 'adult';
  const initial: ShownName = {
    shown: true,
    text: `${person.firstName} ${person.lastName.charAt(0)}.`,
  };
  if (request === 'removed') return { shown: false, why: 'removed' };
  if (setting === 'hidden') return { shown: false, why: 'hidden' };
  if (request === 'initials') {
    return { shown: true, text: `${person.firstName.charAt(0)}. ${person.lastName.charAt(0)}.` };
  }
  if (setting === 'initial') return initial;
  if (child && setting === 'start') return initial;
  return { shown: true, text: `${person.firstName} ${person.lastName}` };
}

const asText = (shown: ShownName) => (shown.shown ? shown.text : null);

async function scan(
  slug: string,
  setting: Setting,
  requests: Readonly<Record<string, NameRequest>>,
  also: ScanCase = {},
) {
  const { seed } = leagueOf(slug);
  const audience = also.audience ?? seed.audience;
  const pages = await pagesOf(slug);
  const want = seed.people.map((person, place) => {
    const request = requests[person.firstName] ?? 'none';
    return { person, place, request, shown: expected(person, audience, setting, request) };
  });
  const absent = (first: string) => also.absentFromStats?.includes(first) === true;
  // The statistics page, by each player's points: the seed gave place p 10 + 4p. A player
  // of a team whose statistics are its staff's only is not on it at all.
  for (const { person, place, shown } of want) {
    const cell = pages.byPoints.get(10 + 4 * place);
    expect(cell, `${slug} ${setting} place ${place}`).toBe(
      absent(person.firstName) ? undefined : shown.shown ? shown.text : 'A player (name not shown)',
    );
  }
  // The rosters show every name the rules give, and none other; the leaders only those.
  const shownNames = want.filter((w) => !absent(w.person.firstName)).map((w) => asText(w.shown));
  expect([...pages.rosterNames].sort()).toEqual(
    want
      .map((w) => w.shown)
      .map((s) => (s.shown ? s.text : null))
      .sort(),
  );
  for (const name of pages.leaderNames) {
    expect([...shownNames, 'A player (name not shown)']).toContain(name);
  }
  // A player of a staff-only team: that team's page shows its totals only, no player line.
  for (const { person, shown } of want.filter((w) => absent(w.person.firstName))) {
    const theirs = pages.teamPages.find((p) =>
      p.roster.lines.some((line) => line.name.shown && line.name.text === asText(shown)),
    );
    expect(theirs?.teamStats?.playerLinesShown, person.firstName).toBe(false);
    expect(theirs?.teamStats?.playerRows ?? [], person.firstName).toEqual([]);
  }
  // One who left their team stays on its roster, marked as having left (R-17).
  for (const { person, shown } of want.filter((w) => also.former?.includes(w.person.firstName))) {
    const lines = pages.teamPages.flatMap((p) => p.roster.lines);
    const theirs = lines.filter((line) => line.name.shown && line.name.text === asText(shown));
    if (!shown.shown) continue;
    expect(
      theirs.map((line) => line.former),
      person.firstName,
    ).toEqual([true]);
  }
  // Nothing withheld, and nothing private, anywhere in any page's data.
  const privateValues = want.flatMap(({ person, request, shown }) =>
    privateValuesOf(
      {
        firstName: person.firstName,
        lastName: person.lastName,
        nameRequest: request,
        birthDate: person.birthDate ?? null,
        contactEmail: person.contactEmail ?? null,
      },
      shown,
    ),
  );
  // What the ports return: every field name and every value is looked at.
  for (const response of pages.fromPorts) {
    expect(findPrivateFields(response, { privateValues })).toEqual([]);
  }
  // What the pages draw from it: every value is looked at, and the rendered page too. A
  // table's model names its columns' long labels `fullName` ("Games played") and a row's
  // values `cells`, words the scan reads as a person's name and a cell phone; they hold no
  // person's data (their values are still looked at), and every other finding fails.
  for (const response of pages.pageData) {
    const findings = findPrivateFields(response, { privateValues });
    const tableWords = findings.filter(
      (f) =>
        f.kind === 'private_field' &&
        (/[cC]olumns\[\d+\]\.fullName$/.test(f.path) || /\.cells$/.test(f.path)),
    );
    expect(findings.filter((f) => !tableWords.includes(f))).toEqual([]);
  }
  // No person's database id in any page's data or HTML: a saved copy would name a player
  // hidden later on their nameless line, and the id carries when the record was made.
  const ids = (await peopleOf(slug)).map((p) => p.id);
  expect(ids.length).toBe(seed.people.length);
  for (const response of pages.pageData) expect(personIdsIn(response, ids)).toEqual([]);
  // Nor a roster place's id, on any team's page: it stays the same across loads and
  // carries when the place was made; a roster row's key is its place on the page.
  const teamIds = pages.teamPages.map((p) => p.head.teamId);
  const entryIds = await rosterEntriesOf(slug, teamIds);
  expect(entryIds.length).toBeGreaterThanOrEqual(seed.people.length);
  for (const response of pages.pageData) expect(personIdsIn(response, entryIds)).toEqual([]);
  return privateValues;
}

describe('the T-81 scan through the database-backed ports', () => {
  for (const slug of ['lakeside', 'maple-street']) {
    it(`${slug}: every names setting, read from the league itself, on every page`, async () => {
      // Each league starts on full names with no confirmation: adults in full, a child
      // (and in a youth league a player of unknown age) by first name and last initial.
      const start = await scan(slug, 'start', {});
      // The scan has something to find, and finds it: a page that held any one of the
      // values it looks for (a child's full name, a birth date, an address) would fail.
      expect(start.length).toBeGreaterThan(0);
      for (const value of start) {
        expect(findPrivateFields({ text: `x ${value} x` }, { privateValues: start })).not.toEqual(
          [],
        );
      }
      // And it finds a person's id, as a row key or anywhere in a page's text.
      const [someone] = await peopleOf(slug);
      if (someone === undefined) throw new Error(`${slug} has no people`);
      expect(personIdsIn({ rows: [{ id: someone.id.toUpperCase() }] }, [someone.id])).toEqual([
        someone.id,
      ]);
      await save(slug, 'privacy.childrenInFullConfirmed', true, true);
      await scan(slug, 'fullConfirmed', {});
      await save(slug, 'privacy.publicNames', 'firstNameLastInitial');
      await scan(slug, 'initial', {});
      await save(slug, 'privacy.publicNames', 'hidden');
      const hidden = await scan(slug, 'hidden', {});
      // Hidden: every first and last name is withheld, so every one is looked for.
      for (const person of leagueOf(slug).seed.people) {
        expect(hidden).toEqual(expect.arrayContaining([person.firstName, person.lastName]));
      }
      // Back to full names, confirmed: everyone in full again.
      await save(slug, 'privacy.publicNames', 'fullName');
      await scan(slug, 'fullConfirmed', {});
      // The confirmation taken back: children with care again.
      await save(slug, 'privacy.childrenInFullConfirmed', false);
      await scan(slug, 'start', {});
    });
  }

  it("follows a player's own request to be taken off, on every page (R-17)", async () => {
    const { leagueId, ownerAccountId, seed } = leagueOf('maple-street');
    const first = seed.people[0];
    if (first === undefined) throw new Error('no person');
    // The person's id, from the owner's own list of people (no public page holds it).
    const personId = (await peopleOf('maple-street')).find(
      (p) => p.firstName === first.firstName,
    )?.id;
    if (personId === undefined) throw new Error(`no ${first.firstName}`);
    const asked = await setNameRequest(
      { leagueId, accountId: ownerAccountId, requestId: 'scan' },
      { personId, version: 1, showAs: 'removed', reason: 'guardianAsked' },
      peopleDeps,
    );
    expect(asked.ok).toBe(true);
    await scan('maple-street', 'start', { [first.firstName]: 'removed' });
    await save('maple-street', 'privacy.childrenInFullConfirmed', true, true);
    await scan('maple-street', 'fullConfirmed', { [first.firstName]: 'removed' });
  });

  it("never lets one league's setting reach the other's pages", async () => {
    await save('lakeside', 'privacy.publicNames', 'hidden');
    // Maple Street is as the test before left it: confirmed full names, one taken off.
    const { seed } = leagueOf('maple-street');
    await scan('maple-street', 'fullConfirmed', { [seed.people[0]?.firstName ?? '']: 'removed' });
    await scan('lakeside', 'hidden', {});
  });
});

/** The owner of a seed league, as a command's context. */
const asOwner = (slug: string) => {
  const { leagueId, ownerAccountId } = leagueOf(slug);
  return { leagueId, accountId: ownerAccountId, requestId: 'scan' };
};
/** A seed person's id, by first name, from the owner's own list. */
const personNamed = async (slug: string, firstName: string) => {
  const id = (await peopleOf(slug)).find((p) => p.firstName === firstName)?.id;
  if (id === undefined) throw new Error(`no ${firstName} in ${slug}`);
  return id;
};
const must = <T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }) => {
  if (!result.ok) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result.value;
};

describe('the T-81 scan on the database: each way a person is shown less or leaves', () => {
  it("follows a person's own request for initials, a staff-only team, a former player and a person in the bin", async () => {
    const slug = 'lakeside';
    const as = asOwner(slug);
    // Back to full names, not confirmed: the start (the tests before left it hidden).
    await save(slug, 'privacy.publicNames', 'fullName');
    await scan(slug, 'start', {});

    // An adult's own request for initials, once the league lets adults ask (R-15, R-25).
    await save(slug, 'privacy.playersMayAskForInitials', true);
    const robin = await personNamed(slug, 'Robin');
    const robinVersion = await peopleDeps.transaction(
      as,
      async (tx) => (await tx.people.find(robin, false))?.version ?? 0,
    );
    must(
      'initials',
      await setNameRequest(
        as,
        { personId: robin, version: robinVersion, showAs: 'initials', reason: 'personAsked' },
        peopleDeps,
      ),
    );
    await scan(slug, 'start', { Robin: 'initials' });

    // The child's team keeps its players' statistics to its staff (S-22): the child is on
    // its roster still, and on no statistics page, leaders card or player line.
    const quinn = await personNamed(slug, 'Quinn');
    const [season] = await stats.seasonsOf(as.leagueId);
    const store = stats.readStoreOf(as.leagueId);
    const playedFor = async (personId: string) => {
      const teams = await store.playerTeams(season?.id ?? '');
      const teamId = teams.find((row) => row.personId === personId)?.teamId;
      if (teamId === undefined) throw new Error(`no team for ${personId}`);
      return teamId;
    };
    const quinnsTeam = await playedFor(quinn);
    const teamVersion = await teamsDeps.transaction(
      as,
      async (tx) => (await tx.teams.find(quinnsTeam))?.version ?? 0,
    );
    must(
      'staff only',
      await setTeamStatsVisibility(
        as,
        { teamId: quinnsTeam, version: teamVersion, statsVisibility: 'staff' },
        teamsDeps,
      ),
    );
    await scan(slug, 'start', { Robin: 'initials' }, { absentFromStats: ['Quinn'] });

    // A player who left their team: still on its roster, marked, and still in the
    // statistics of the games they played (R-17).
    const morgan = await personNamed(slug, 'Morgan');
    const morgansTeam = await playedFor(morgan);
    // The day they left: the day they joined, or the league's own today (a leaving date
    // after the league's today is refused, step 2.161; the computer's UTC date can be
    // a day ahead of it).
    const { entry, today } = await teamsDeps.transaction(as, async (tx) => ({
      entry: (await tx.teams.listRoster(morgansTeam)).find((line) => line.personId === morgan),
      today: await tx.teams.leagueToday(),
    }));
    if (entry === undefined) throw new Error('no roster entry for Morgan');
    must(
      'left',
      await markLeft(
        as,
        {
          rosterEntryId: entry.id,
          version: entry.version,
          leftOn: entry.joinedOn ?? today,
        },
        teamsDeps,
      ),
    );
    const left = { absentFromStats: ['Quinn'], former: ['Morgan'] } as const;
    await scan(slug, 'start', { Robin: 'initials' }, left);

    // The same person moved to the bin: no name on any page, though their games still
    // count (a nameless line), and nothing of theirs anywhere, their id included.
    must('bin', await removePerson(as, { personId: morgan }, peopleDeps));
    const binned = await scan(slug, 'start', { Robin: 'initials', Morgan: 'removed' }, left);
    expect(binned).toEqual(expect.arrayContaining(['Morgan', 'Example']));
  });
});

describe('the T-81 scan on the database: a league whose players are of mixed ages', () => {
  beforeAll(async () => {
    await db.close();
    await made.close();
    peopleKept.clear();
    entriesKept.clear();
    versions.clear();
    await open({ audiences: { lakeside: 'mixed' } });
  }, 120_000);

  it('shows a player whose age is not known as a child until the confirmation (R-14, R-15)', async () => {
    // Robin's age is not known: in a mixed league that is a child, with care.
    const start = await scan('lakeside', 'start', {}, { audience: 'mixed' });
    expect(start).toEqual(expect.arrayContaining(['Placeholder']));
    await save('lakeside', 'privacy.childrenInFullConfirmed', true, true);
    await scan('lakeside', 'fullConfirmed', {}, { audience: 'mixed' });
    await save('lakeside', 'privacy.publicNames', 'firstNameLastInitial');
    await scan('lakeside', 'initial', {}, { audience: 'mixed' });
  });
});
