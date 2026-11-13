// The leagues module's storage on plain objects, for core's command tests. The same
// commands run against the real database in packages/database (stores and the
// two-league harness); the database's own rules (a short name another league holds)
// are stood in for here by `otherLeaguesSlugs`.
import {
  memoryDatabase,
  memoryTransaction,
  testDeps,
} from '../../command/testing/memory-transaction.ts';
import type { LeagueRecord, LeaguesTx } from './ports.ts';

export type MemoryLeagues = {
  /** Undefined until createLeague runs. */
  league: LeagueRecord | undefined;
  staff: string[];
  /** Short names held by other leagues or their forwarding. */
  otherLeaguesSlugs: string[];
  forwarding: { slug: string; months: number }[];
  programs: { id: string; slug: string; isDefault: boolean }[];
  seasons: { id: string; programId: string; slug: string; isCurrent: boolean }[];
};

export const leagueId = '01900000-0000-7000-8000-000000000001';
export const ownerId = '01900000-0000-7000-8000-0000000000a1';
export const staffId = '01900000-0000-7000-8000-0000000000b1';

export function memoryLeagues(state: Partial<MemoryLeagues> = {}) {
  const db = memoryDatabase<MemoryLeagues>({
    league: {
      id: leagueId,
      name: 'Old name',
      slug: 'old-name',
      status: 'draft',
      ownerAccountId: ownerId,
      version: 3,
    },
    staff: [staffId],
    otherLeaguesSlugs: ['taken-name'],
    forwarding: [],
    programs: [{ id: 'program-default', slug: 'main', isDefault: true }],
    seasons: [],
    ...state,
  });
  let accountId: string | null = null;
  const transaction = memoryTransaction(db, (s, jobs): LeaguesTx => {
    const bump = (version: number) => {
      if (s.league === undefined || s.league.version !== version) return undefined;
      return s.league.version + 1;
    };
    return {
      jobs,
      leagues: {
        currentLeague: async () => (s.league === undefined ? undefined : { ...s.league }),
        setName: async (name, version) => {
          const next = bump(version);
          if (next === undefined || s.league === undefined) return undefined;
          s.league = { ...s.league, name, version: next };
          return next;
        },
        isPlatformStaff: async () => accountId !== null && s.staff.includes(accountId),
        createLeague: async (league) => {
          if (s.league !== undefined) return 'league-exists';
          if (s.otherLeaguesSlugs.includes(league.slug)) return 'short-name-taken';
          s.league = {
            id: leagueId,
            name: league.name,
            slug: league.slug,
            status: 'draft',
            ownerAccountId: league.ownerAccountId,
            version: 1,
          };
          s.programs.push({ id: 'program-new', ...league.defaultProgram, isDefault: true });
          return s.league;
        },
        renameShortName: async (slug, version, months) => {
          const next = bump(version);
          if (next === undefined || s.league === undefined) return undefined;
          if (s.otherLeaguesSlugs.includes(slug)) return 'taken';
          s.forwarding.push({ slug: s.league.slug, months });
          s.league = { ...s.league, slug, version: next };
          return next;
        },
        setStatus: async (status, version) => {
          const next = bump(version);
          if (next === undefined || s.league === undefined) return undefined;
          s.league = { ...s.league, status, version: next };
          return next;
        },
        findProgram: async (programId) =>
          s.programs.find((p) => (programId === undefined ? p.isDefault : p.id === programId)),
        createSeason: async (season) => {
          if (s.seasons.some((x) => x.programId === season.programId && x.slug === season.slug)) {
            return 'slug-taken';
          }
          const id = `season-${s.seasons.length + 1}`;
          s.seasons.push({ id, programId: season.programId, slug: season.slug, isCurrent: false });
          return id;
        },
        setCurrentSeason: async (seasonId) => {
          const season = s.seasons.find((x) => x.id === seasonId);
          if (season === undefined) return false;
          for (const other of s.seasons) {
            if (other.programId === season.programId) other.isCurrent = other === season;
          }
          return true;
        },
      },
    };
  });
  const deps = testDeps(transaction);
  /** A context for `account`, and the store told who is acting. */
  const as = (account: string | null, league = leagueId) => {
    accountId = account;
    return { leagueId: league, accountId: account, requestId: 'request-1' };
  };
  return { db, deps, as, transaction };
}
