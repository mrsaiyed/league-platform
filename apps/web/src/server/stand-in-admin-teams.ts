// THE ADMIN TEAMS SCREENS' LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// Made-up teams, people and rosters held in this process's memory (T-201), one set per
// league, so the Teams screens (step 2.51) can be used with no database. The real
// teams and people commands run on it, so every rule (who may change what, a number
// worn twice, a person still on a roster) is the product's own: only the storage is
// made up. A transaction works on a copy that is kept only if the work returns, as
// the database's does, and transactions run one after another.
//
// Gone when the database-backed list of a season's teams is wired to the web app.
import type {
  AccessReader,
  ActivityEntry,
  CommandDeps,
  PeopleStore,
  PersonRecord,
  RosterEntryRecord,
  StoredSetting,
  TeamRecord,
  TeamsStore,
} from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import type { AdminDivision, AdminSeason, AdminTeamsPorts, AdminTeamsTx } from './admin-teams.ts';

type Division = AdminDivision & { readonly seasonId: string; readonly binned: boolean };
type Person = PersonRecord & { readonly sensitive: NonNullable<PersonRecord['sensitive']> };

type LeagueState = {
  season: AdminSeason & { programId: string };
  divisions: Division[];
  teams: TeamRecord[];
  people: Person[];
  roster: RosterEntryRecord[];
  /** The season asks for a different number for each player (0008). */
  uniqueJerseys: boolean;
  settings: Record<string, StoredSetting[]>;
  activity: ActivityEntry[];
};

export type StandInAdminTeamsOptions = {
  /** What a permission check reads for one league: the league's owner, state and grants. */
  readonly accessOf: (leagueId: string) => AccessReader;
  /** Where the commands' T-196 lines go. */
  readonly log: CommandDeps<AdminTeamsTx>['log'];
  /** A league that starts with a few made-up teams and people, so the screens are not empty. */
  readonly seededLeagueId?: string;
  /** The season asks for a different number for each player (default: it does not). */
  readonly uniqueJerseys?: boolean;
};

const uuid = () => randomUUID();

function emptyState(): LeagueState {
  return {
    season: { id: uuid(), name: 'Made-up season', programId: uuid() },
    divisions: [],
    teams: [],
    people: [],
    roster: [],
    uniqueJerseys: false,
    settings: {},
    activity: [],
  };
}

function madeUpPerson(firstName: string, lastName: string): Person {
  return {
    id: uuid(),
    firstName,
    lastName,
    publicName: null,
    visibility: 'none',
    binned: false,
    version: 1,
    sensitive: { contactEmail: null, birthDate: null, isMinor: null },
  };
}

const madeUpNames = [
  ['Jordan', 'Castellanos'],
  ['Imani', 'Brooks'],
  ['Dana', 'Whitfield'],
  ['Sam', 'Rivera'],
  ['Noor', 'Haddad'],
  ['Priya', 'Nair'],
  ['Marcus', 'Lee'],
  ['Tess', 'Okafor'],
  ['Leo', 'Fischer'],
  ['Aiko', 'Tanaka'],
  ['Omar', 'Said'],
  ['Rosa', 'Delgado'],
] as const;

function seededState(): LeagueState {
  const state = emptyState();
  state.season = { ...state.season, name: 'Winter 2026' };
  const east: Division = { id: uuid(), name: 'East', seasonId: state.season.id, binned: false };
  const west: Division = { id: uuid(), name: 'West', seasonId: state.season.id, binned: false };
  state.divisions.push(east, west);
  const team = (name: string, slug: string, color: string, division: Division): TeamRecord => ({
    id: uuid(),
    seasonId: state.season.id,
    divisionId: division.id,
    slug,
    name,
    color,
    statsVisibility: 'everyone',
    lineageId: uuid(),
    binned: false,
    version: 1,
  });
  state.teams.push(team('Lions', 'lions', '#c8a84b', east), team('Owls', 'owls', '#1f5fbf', west));
  for (const [first, last] of madeUpNames) state.people.push(madeUpPerson(first, last));
  return state;
}

export function standInAdminTeams(options: StandInAdminTeamsOptions): AdminTeamsPorts {
  const states = new Map<string, LeagueState>();
  const stateOf = (leagueId: string): LeagueState => {
    let found = states.get(leagueId);
    if (found === undefined) {
      found = leagueId === options.seededLeagueId ? seededState() : emptyState();
      found.uniqueJerseys = options.uniqueJerseys ?? false;
      states.set(leagueId, found);
    }
    return found;
  };

  // One transaction at a time, so two requests cannot overwrite each other's copy.
  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const deps: CommandDeps<AdminTeamsTx> = {
    transaction: (context, work) =>
      serially(async () => {
        const draft = structuredClone(stateOf(context.leagueId));
        const result = await work(txOver(draft, options.accessOf(context.leagueId)));
        states.set(context.leagueId, draft);
        return result;
      }),
    events: [],
    log: options.log,
    now: () => performance.now(),
  };

  return {
    deps,
    currentSeason: async (leagueId) => {
      const { id, name } = stateOf(leagueId).season;
      return { id, name };
    },
    divisions: async (leagueId, seasonId) =>
      stateOf(leagueId)
        .divisions.filter((d) => d.seasonId === seasonId && !d.binned)
        .map(({ id, name }) => ({ id, name })),
    teams: async (leagueId, seasonId) =>
      stateOf(leagueId)
        .teams.filter((t) => t.seasonId === seasonId && !t.binned)
        .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function txOver(s: LeagueState, access: AccessReader): AdminTeamsTx {
  const clash = (t: { seasonId: string; slug: string; name: string }, except?: string) => {
    const others = s.teams.filter((o) => o.id !== except && !o.binned && o.seasonId === t.seasonId);
    if (others.some((o) => o.slug === t.slug)) return 'slug-taken' as const;
    if (others.some((o) => o.name.trim().toLowerCase() === t.name.trim().toLowerCase())) {
      return 'name-taken' as const;
    }
    return undefined;
  };

  const teams: TeamsStore = {
    leagueSettingRows: async (key) => s.settings[key] ?? [],
    find: async (id) => s.teams.find((t) => t.id === id),
    create: async (t) => {
      const taken = clash(t);
      if (taken !== undefined) return taken;
      const id = uuid();
      s.teams.push({ id, ...t, lineageId: uuid(), binned: false, version: 1 });
      return id;
    },
    update: async (id, change, version) => {
      const at = s.teams.findIndex((t) => t.id === id);
      const found = s.teams[at];
      if (found === undefined || found.binned || found.version !== version) return undefined;
      const next: TeamRecord = { ...found, ...change, version: found.version + 1 };
      const taken = clash(next, id);
      if (taken !== undefined) return taken;
      s.teams[at] = next;
      return next.version;
    },
    setBinned: async (id, binned) => {
      const at = s.teams.findIndex((t) => t.id === id);
      const found = s.teams[at];
      if (found === undefined) return false;
      s.teams[at] = { ...found, binned, version: found.version + 1 };
      return true;
    },
    findPerson: async (id) => {
      const p = s.people.find((x) => x.id === id);
      return p === undefined ? undefined : { id: p.id, binned: p.binned };
    },
    findRosterEntry: async (id) => s.roster.find((e) => e.id === id),
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
            ...e,
            firstName: p?.firstName ?? '',
            lastName: p?.lastName ?? '',
            publicName: p?.publicName ?? null,
          };
        }),
    addRosterEntry: async (e) => {
      const mine = s.roster.filter((r) => r.teamId === e.teamId);
      if (mine.some((r) => r.personId === e.personId && r.leftOn === null)) {
        return 'already-on-team';
      }
      if (
        s.uniqueJerseys &&
        e.jerseyNumber !== null &&
        mine.some((r) => r.leftOn === null && r.jerseyNumber === e.jerseyNumber)
      ) {
        return 'jersey-taken';
      }
      const id = uuid();
      s.roster.push({
        id,
        ...e,
        leftOn: null,
        sort: Math.max(-1, ...mine.map((r) => r.sort)) + 1,
        version: 1,
      });
      return id;
    },
    updateRosterEntry: async (id, change, version) => {
      const at = s.roster.findIndex((e) => e.id === id);
      const found = s.roster[at];
      if (found === undefined || (version !== undefined && found.version !== version)) {
        return undefined;
      }
      if (
        s.uniqueJerseys &&
        change.jerseyNumber !== undefined &&
        change.jerseyNumber !== null &&
        s.roster.some(
          (r) =>
            r.id !== id &&
            r.teamId === found.teamId &&
            r.leftOn === null &&
            r.jerseyNumber === change.jerseyNumber,
        )
      ) {
        return 'jersey-taken';
      }
      const next: RosterEntryRecord = { ...found, ...change, version: found.version + 1 };
      s.roster[at] = next;
      return next.version;
    },
    seasonProgramId: async (id) => (id === s.season.id ? s.season.programId : undefined),
    findDivision: async (id) => {
      const d = s.divisions.find((x) => x.id === id);
      return d === undefined ? undefined : { seasonId: d.seasonId, binned: d.binned };
    },
  };

  const shown = (p: Person, sensitive: boolean): PersonRecord => {
    const { sensitive: kept, ...plain } = p;
    return sensitive ? { ...plain, sensitive: kept } : plain;
  };
  const people: PeopleStore = {
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
      const id = uuid();
      s.people.push({
        id,
        firstName: p.firstName,
        lastName: p.lastName,
        publicName: p.publicName,
        visibility: 'none',
        binned: false,
        version: 1,
        sensitive: { contactEmail: p.contactEmail, birthDate: p.birthDate, isMinor: p.isMinor },
      });
      return id;
    },
    update: async (id, change, version) => {
      const at = s.people.findIndex((x) => x.id === id);
      const found = s.people[at];
      if (found === undefined || found.binned || found.version !== version) return undefined;
      const { contactEmail, birthDate, isMinor, ...plain } = change;
      s.people[at] = {
        ...found,
        ...plain,
        sensitive: {
          contactEmail: contactEmail === undefined ? found.sensitive.contactEmail : contactEmail,
          birthDate: birthDate === undefined ? found.sensitive.birthDate : birthDate,
          isMinor: isMinor === undefined ? found.sensitive.isMinor : isMinor,
        },
        version: found.version + 1,
      };
      return found.version + 1;
    },
    setBinned: async (id, binned) => {
      const at = s.people.findIndex((x) => x.id === id);
      const found = s.people[at];
      if (found === undefined) return false;
      s.people[at] = { ...found, binned, version: found.version + 1 };
      return true;
    },
    isOnRoster: async (personId) =>
      s.roster.some((r) => r.personId === personId && r.leftOn === null),
  };

  return {
    jobs: { enqueue: async () => undefined },
    access,
    activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
    teams,
    people,
  };
}
