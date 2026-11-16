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
// withheld first or last name, or any private value (a contact address, a birth date).
import {
  findPrivateFields,
  privateValuesOf,
  publicViewer,
  readStatisticsTable,
  setNameRequest,
  setSetting,
  type CommandDeps,
  type LeaguesTx,
  type NameRequest,
  type PeopleTx,
  type ShownName,
} from '@srleagues/core';
import * as database from '@srleagues/database';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { homeLeadersOf } from '../features/stats-pages/build-home-leaders.ts';
import { loadStatsPage } from '../features/stats-pages/build-stats.ts';
import { StatsTables } from '../features/stats-pages/stats-page.tsx';
import { loadTeamCards, loadTeamHead, loadTeamStats } from '../features/team-pages/build-team.ts';
import { databasePublicStats } from './database-public-stats.ts';
import { databasePublicTeams } from './database-public-teams.ts';
import type { PublicStatsPorts } from './public-stats.ts';
import type { PublicTeamsPorts } from './public-teams.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let stats: PublicStatsPorts;
let teams: PublicTeamsPorts;
let settingsDeps: CommandDeps<LeaguesTx>;
let peopleDeps: CommandDeps<PeopleTx>;

beforeAll(async () => {
  made = await database.madeUpDatabase({ underWay: true });
  db = database.createDatabase(made.source);
  stats = databasePublicStats(database, db);
  teams = databasePublicTeams(database, db);
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
}, 120_000);

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
    const page = await stats.statisticsOf(leagueId, async ({ store, settings }) => {
      const head = await loadTeamHead(store, leagueId, season.id, card.slug);
      if (head === undefined) throw new Error(`no ${card.slug}`);
      const teamStats = await loadTeamStats(store, settings, { ...input, teamId: head.teamId });
      return { head, teamStats };
    });
    const roster = await teams.rosterOf(leagueId, page.head.teamId, publicViewer(leagueId));
    teamPages.push({ ...page, roster });
  }
  return {
    fromPorts: [table.value, leaders, ...teamPages.map((p) => p.roster)] as unknown[],
    pageData: [
      statsPage,
      cards,
      ...teamPages.map(({ head, teamStats }) => ({ head, teamStats })),
      // The statistics page as it is sent.
      renderToStaticMarkup(createElement(StatsTables, { data: statsPage })),
    ] as unknown[],
    /** Each player as the statistics page shows them, by points (10, 14, 18 in seed order). */
    byPoints: new Map(
      statsPage.playerRows.map((row) => [Number(row.cells['points']), row.cells['player']]),
    ),
    rosterNames: teamPages
      .flatMap((p) => p.roster.lines)
      .map((line) => (line.name.shown ? line.name.text : null)),
    leaderNames: leaders.map((l) => l.name),
  };
}

/** Saves a league setting as its owner, through the settings command (League settings). */
const versions = new Map<string, number>();
async function save(slug: string, key: string, value: unknown, confirmed?: boolean) {
  const { leagueId, ownerAccountId } = leagueOf(slug);
  const known = `${leagueId}/${key}`;
  const saved = await setSetting(
    { leagueId, accountId: ownerAccountId, requestId: 'scan' },
    {
      level: 'league',
      key,
      value,
      version: versions.get(known) ?? null,
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
) {
  const { seed } = leagueOf(slug);
  const pages = await pagesOf(slug);
  const want = seed.people.map((person, place) => {
    const request = requests[person.firstName] ?? 'none';
    return { person, place, request, shown: expected(person, seed.audience, setting, request) };
  });
  // The statistics page, by each player's points: the seed gave place p 10 + 4p.
  for (const { place, shown } of want) {
    const cell = pages.byPoints.get(10 + 4 * place);
    expect(cell, `${slug} ${setting} place ${place}`).toBe(
      shown.shown ? shown.text : 'A player (name not shown)',
    );
  }
  // The rosters and the leaders show the same names, and none other.
  const shownNames = want.map((w) => asText(w.shown));
  expect([...pages.rosterNames].sort()).toEqual(
    want
      .map((w) => w.shown)
      .map((s) => (s.shown ? s.text : null))
      .sort(),
  );
  for (const name of pages.leaderNames) {
    expect([...shownNames, 'A player (name not shown)']).toContain(name);
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
    // The person's id, as the statistics page holds it (its row id).
    const [season] = await stats.seasonsOf(leagueId);
    const page = await stats.statisticsOf(leagueId, ({ store, settings }) =>
      loadStatsPage(store, settings, { leagueId, seasonId: season?.id ?? '', by: 'total' }),
    );
    if ('code' in page) throw new Error(page.code);
    const personId = page.playerRows.find((row) => Number(row.cells['points']) === 10)?.id;
    if (personId === undefined) throw new Error('no player with 10 points');
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
