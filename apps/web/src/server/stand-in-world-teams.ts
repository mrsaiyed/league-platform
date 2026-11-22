// THE TEAMS, PEOPLE AND ROSTERS OF THE ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY.
//
// The teams and people modules' stores over one league's world (stand-in-world-state.ts),
// as packages/database's teams and people stores read and write the same tables: a team
// added here is a team of the season everywhere, and a roster entry is the player the
// tracker, the box score grid and the public pages all read. The database's own rules
// (a short name or a name once a season, a number worn once where the season asks, a
// person once on a team) are stood in for by the checks made here.
import type {
  PeopleStore,
  PersonRecord,
  RosterEntryRecord,
  TeamRecord,
  TeamsStore,
} from '@srleagues/core';
import { dayIn, minorAt } from './stand-in-world-clock.ts';
import { newId } from './stand-in-world-ids.ts';
import { uniqueJerseysOf } from './stand-in-world-games.ts';
import { replacedAt } from './stand-in-world-rows.ts';
import type { LeagueWorld, WorldPerson } from './stand-in-world-state.ts';

const entryOf = ({
  addedAtGameId: _added,
  needsReview: _review,
  ...entry
}: LeagueWorld['roster'][number]): RosterEntryRecord => entry;

/** The teams store over one league's world; `now` is the world's one clock (stand-in-world.ts). */
export function worldTeamsStore(s: LeagueWorld, now: () => Date): TeamsStore {
  const clash = (t: { seasonId: string; slug: string; name: string }, except?: string) => {
    const others = s.teams.filter((o) => o.id !== except && !o.binned && o.seasonId === t.seasonId);
    if (others.some((o) => o.slug === t.slug)) return 'slug-taken' as const;
    if (others.some((o) => o.name.trim().toLowerCase() === t.name.trim().toLowerCase())) {
      return 'name-taken' as const;
    }
    return undefined;
  };
  const jerseyWorn = (teamId: string, jersey: string | null, except?: string) =>
    jersey !== null &&
    uniqueJerseysOf(s, teamId) &&
    s.roster.some(
      (r) =>
        r.id !== except &&
        r.teamId === teamId &&
        r.leftOn === null &&
        !r.needsReview &&
        r.jerseyNumber === jersey,
    );
  return {
    leagueSettingRows: async (key) =>
      s.settings
        .filter((r) => r.key === key && r.place.level === 'league')
        .map((r) => ({ level: r.place.level, document: r.document })),
    find: async (id) => s.teams.find((t) => t.id === id),
    create: async (t) => {
      const taken = clash(t);
      if (taken !== undefined) return taken;
      const id = newId();
      s.teams = [...s.teams, { id, ...t, lineageId: newId(), binned: false, version: 1 }];
      return id;
    },
    update: async (id, change, version) => {
      const at = s.teams.findIndex((t) => t.id === id);
      const found = s.teams[at];
      if (found === undefined || found.binned || found.version !== version) return undefined;
      const next: TeamRecord = { ...found, ...change, version: found.version + 1 };
      const taken = clash(next, id);
      if (taken !== undefined) return taken;
      s.teams = replacedAt(s.teams, at, next);
      return next.version;
    },
    setBinned: async (id, binned) => {
      const at = s.teams.findIndex((t) => t.id === id);
      const found = s.teams[at];
      if (found === undefined) return false;
      if (!binned) {
        const taken = clash(found, id);
        if (taken !== undefined) return taken;
      }
      s.teams = replacedAt(s.teams, at, { ...found, binned, version: found.version + 1 });
      return true;
    },
    // As queries/find-team-games.ts and the season's draft (A-17).
    games: async (teamId, seasonId) => {
      const mine = s.games
        .filter((g) => !g.binned && (g.homeTeamId === teamId || g.awayTeamId === teamId))
        .sort(
          (a, b) =>
            (a.startsAt ?? '9999').localeCompare(b.startsAt ?? '9999') || a.id.localeCompare(b.id),
        );
      return {
        played: mine.filter((g) => g.status === 'final' || g.status === 'forfeit').length,
        toPlay: mine
          .filter((g) => ['scheduled', 'postponed', 'live'].includes(g.status))
          .map((g) => ({
            id: g.id,
            date: g.localDate,
            round: s.rounds.find((r) => r.id === g.roundId)?.number ?? null,
          })),
        draftChanges: s.drafts.find((d) => d.seasonId === seasonId)?.changes ?? null,
      };
    },
    findPerson: async (id) => {
      const p = s.people.find((x) => x.id === id);
      return p === undefined ? undefined : { id: p.id, binned: p.binned };
    },
    findRosterEntry: async (id) => {
      const found = s.roster.find((e) => e.id === id);
      return found === undefined ? undefined : entryOf(found);
    },
    listRoster: async (teamId) =>
      s.roster
        .filter((e) => e.teamId === teamId)
        // Current first, then those who left by date, then place, then id (list-roster.ts).
        .sort(
          (a, b) =>
            Number(a.leftOn !== null) - Number(b.leftOn !== null) ||
            (a.leftOn ?? '').localeCompare(b.leftOn ?? '') ||
            a.sort - b.sort ||
            a.id.localeCompare(b.id),
        )
        .map((e) => {
          const p = s.people.find((x) => x.id === e.personId);
          return {
            ...entryOf(e),
            firstName: p?.firstName ?? '',
            lastName: p?.lastName ?? '',
            publicName: p?.publicName ?? null,
            needsReview: e.needsReview,
          };
        }),
    addRosterEntry: async (e) => {
      const mine = s.roster.filter((r) => r.teamId === e.teamId);
      if (mine.some((r) => r.personId === e.personId && r.leftOn === null)) {
        return 'already-on-team';
      }
      if (jerseyWorn(e.teamId, e.jerseyNumber)) return 'jersey-taken';
      const id = newId();
      s.roster = [
        ...s.roster,
        {
          id,
          ...e,
          leftOn: null,
          sort: Math.max(-1, ...mine.map((r) => r.sort)) + 1,
          version: 1,
          addedAtGameId: null,
          needsReview: false,
        },
      ];
      return id;
    },
    updateRosterEntry: async (id, change, version) => {
      const at = s.roster.findIndex((e) => e.id === id);
      const found = s.roster[at];
      if (found === undefined || (version !== undefined && found.version !== version)) {
        return undefined;
      }
      // An entry waiting for review is not held to unique numbers until it is confirmed:
      // the database's trigger skips it (0015, `or new.needs_review`).
      const checked = !found.needsReview;
      if (
        checked &&
        change.jerseyNumber !== undefined &&
        jerseyWorn(found.teamId, change.jerseyNumber, id)
      ) {
        return 'jersey-taken';
      }
      // Put back on the roster (leaving date cleared): as the database's roster_entries_once
      // index and unique-number trigger refuse an entry opened again.
      if (change.leftOn === null && found.leftOn !== null) {
        const open = s.roster.some(
          (r) =>
            r.id !== id &&
            r.teamId === found.teamId &&
            r.personId === found.personId &&
            r.leftOn === null,
        );
        if (open) return 'already-on-team';
        const jersey = change.jerseyNumber === undefined ? found.jerseyNumber : change.jerseyNumber;
        if (checked && jerseyWorn(found.teamId, jersey, id)) return 'jersey-taken';
      }
      s.roster = replacedAt(s.roster, at, { ...found, ...change, version: found.version + 1 });
      return found.version + 1;
    },
    // The league's today in its own zone, by the world's own clock (as the games store's).
    leagueToday: async () => dayIn(now(), s.timeZone),
    seasonProgramId: async (id) => s.seasons.find((x) => x.id === id)?.programId,
    findDivision: async (id) => {
      const d = s.divisions.find((x) => x.id === id);
      return d === undefined ? undefined : { seasonId: d.seasonId, binned: d.binned };
    },
  };
}

const shown = (p: WorldPerson, sensitive: boolean): PersonRecord => {
  const { sensitive: kept, accountId: _account, ...plain } = p;
  return sensitive ? { ...plain, sensitive: kept } : plain;
};

/** The people store over one league's world; `now` is the world's one clock (stand-in-world.ts). */
export function worldPeopleStore(s: LeagueWorld, now: () => Date): PeopleStore {
  return {
    find: async (id, sensitive) => {
      const p = s.people.find((x) => x.id === id);
      return p === undefined ? undefined : shown(p, sensitive);
    },
    list: async ({ search, limit, offset, sensitive }) => {
      const needle = search?.toLowerCase();
      return s.people
        .filter((p) => !p.binned)
        .filter(
          (p) =>
            needle === undefined ||
            `${p.firstName} ${p.lastName}\n${p.publicName ?? ''}`
              .toLowerCase()
              .replace(/[\u2018\u2019]/g, "'")
              .includes(needle),
        )
        .sort(
          (a, b) =>
            a.lastName.localeCompare(b.lastName) ||
            a.firstName.localeCompare(b.firstName) ||
            a.id.localeCompare(b.id),
        )
        .slice(offset, offset + limit)
        .map((p) => shown(p, sensitive));
    },
    create: async (p) => {
      const id = newId();
      s.people = [
        ...s.people,
        {
          id,
          firstName: p.firstName,
          lastName: p.lastName,
          publicName: p.publicName,
          visibility: 'none',
          binned: false,
          version: 1,
          sensitive: { contactEmail: p.contactEmail, birthDate: p.birthDate, isMinor: p.isMinor },
          accountId: null,
        },
      ];
      return id;
    },
    update: async (id, change, version) => {
      const at = s.people.findIndex((x) => x.id === id);
      const found = s.people[at];
      if (found === undefined || found.binned || found.version !== version) return undefined;
      const { contactEmail, birthDate, isMinor, ...plain } = change;
      s.people = replacedAt(s.people, at, {
        ...found,
        ...plain,
        sensitive: {
          contactEmail: contactEmail === undefined ? found.sensitive.contactEmail : contactEmail,
          birthDate: birthDate === undefined ? found.sensitive.birthDate : birthDate,
          isMinor: isMinor === undefined ? found.sensitive.isMinor : isMinor,
        },
        version: found.version + 1,
      });
      return found.version + 1;
    },
    setBinned: async (id, binned) => {
      const at = s.people.findIndex((x) => x.id === id);
      const found = s.people[at];
      if (found === undefined) return false;
      s.people = replacedAt(s.people, at, { ...found, binned, version: found.version + 1 });
      return true;
    },
    // As queries/is-person-on-roster.ts: a place on a team in the bin does not count (A-16).
    isOnRoster: async (personId) =>
      s.roster.some(
        (r) =>
          r.personId === personId &&
          r.leftOn === null &&
          s.teams.some((t) => t.id === r.teamId && !t.binned),
      ),
    leagueAudience: async () => s.audience,
    // R-28 on the league's own today, by the world's one clock (find-person-is-minor.ts).
    isMinor: async (personId) => {
      const p = s.people.find((x) => x.id === personId);
      return p === undefined ? true : minorAt(p, s.timeZone, now());
    },
    // The league's today in its own zone, by the world's one clock (as the teams store's).
    leagueToday: async () => dayIn(now(), s.timeZone),
    leagueSettingRows: async (key) =>
      s.settings
        .filter((r) => r.key === key && r.place.level === 'league')
        .map((r) => ({ level: r.place.level, document: r.document, version: r.version })),
  };
}
