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
import { randomUUID } from 'node:crypto';
import { uniqueJerseysOf } from './stand-in-world-games.ts';
import { replacedAt } from './stand-in-world-rows.ts';
import type { LeagueWorld, WorldPerson } from './stand-in-world-state.ts';

const entryOf = ({
  addedAtGameId: _added,
  needsReview: _review,
  ...entry
}: LeagueWorld['roster'][number]): RosterEntryRecord => entry;

export function worldTeamsStore(s: LeagueWorld): TeamsStore {
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
      const id = randomUUID();
      s.teams = [...s.teams, { id, ...t, lineageId: randomUUID(), binned: false, version: 1 }];
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
      const id = randomUUID();
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
      if (change.jerseyNumber !== undefined && jerseyWorn(found.teamId, change.jerseyNumber, id)) {
        return 'jersey-taken';
      }
      s.roster = replacedAt(s.roster, at, { ...found, ...change, version: found.version + 1 });
      return found.version + 1;
    },
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

export function worldPeopleStore(s: LeagueWorld): PeopleStore {
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
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(needle) ||
            (p.publicName ?? '').toLowerCase().includes(needle),
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
      const id = randomUUID();
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
    isOnRoster: async (personId) =>
      s.roster.some((r) => r.personId === personId && r.leftOn === null),
    leagueAudience: async () => s.audience,
    leagueSettingRows: async (key) =>
      s.settings
        .filter((r) => r.key === key && r.place.level === 'league')
        .map((r) => ({ level: r.place.level, document: r.document, version: r.version })),
  };
}
