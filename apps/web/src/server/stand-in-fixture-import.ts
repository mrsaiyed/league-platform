// THE FIXTURE IMPORT SCREEN'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// A made-up season in this process's memory (T-201), so the admin's fixture import screen
// can be opened and used with no database and no worker. It runs the real imports commands
// over an in-memory store, so what they refuse and record is what the database-backed store
// is held to. Like the database, a transaction works on a copy and keeps it only if the work
// returns. The worker's part, reading an uploaded file once (`imports.run`), is done here
// right after the upload's transaction is kept, as the worker would do it moments later.
// Only one made-up league has a season; every other league has none.
import {
  importsRunJob,
  parseDraftDocument,
  readFixtureImport,
  type AccessReader,
  type ActivityEntry,
  type CommandContext,
  type CommandDeps,
  type CommandLogLine,
  type DraftRecord,
  type ImportRecord,
  type ImportsTx,
  type Job,
  type SeasonNames,
} from '@srleagues/core';
import type { FixtureImportPorts, ImportNames, ImportSeason } from './fixture-import-ports.ts';

const id = (kind: number, n: number) =>
  `01900000-0000-7000-8000-${kind.toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;

type State = {
  imports: ImportRecord[];
  draft: DraftRecord | undefined;
  draftsStarted: number;
  activity: ActivityEntry[];
};

export type StandInFixtureImportOptions = {
  /** The league the made-up season belongs to. */
  readonly leagueId: string;
  /** The league's access reads (owner, state, grants), the same the shell uses. */
  readonly accessOf: (leagueId: string) => AccessReader;
  readonly log: (line: CommandLogLine) => void;
};

const season: ImportSeason & { readonly programId: string } = {
  id: id(0x5e, 1),
  name: '2026–27 Season',
  programId: id(0x9a, 1),
};

/** The made-up season's teams and venues, as the file's names are matched to them. */
const names: SeasonNames = {
  teams: [
    { id: id(0x7e, 1), name: 'Lions' },
    { id: id(0x7e, 2), name: 'Tigers' },
    { id: id(0x7e, 3), name: 'Hawks' },
    { id: id(0x7e, 4), name: 'Bears' },
  ],
  venues: [{ id: id(0x7f, 1), name: 'Central Gym', courts: ['Court 1', 'Court 2'] }],
};

const emptyState = (): State => ({ imports: [], draft: undefined, draftsStarted: 0, activity: [] });

export function standInFixtureImport(options: StandInFixtureImportOptions): FixtureImportPorts {
  let state = emptyState();
  const ours = (leagueId: string) => leagueId === options.leagueId;
  const stateOf = (leagueId: string) => (ours(leagueId) ? state : emptyState());
  const hasSeason = (leagueId: string, seasonId: string) =>
    ours(leagueId) && seasonId === season.id;

  const txOf = (leagueId: string, s: State, jobs: Job[]): ImportsTx => ({
    jobs: { enqueue: async (job) => void jobs.push(job) },
    access: options.accessOf(leagueId),
    activity: { record: async (entry) => void s.activity.push(entry), list: async () => [] },
    imports: {
      findSeason: async (seasonId) => (hasSeason(leagueId, seasonId) ? season : undefined),
      seasonNames: async (seasonId) =>
        hasSeason(leagueId, seasonId) ? names : { teams: [], venues: [] },
      insert: async (value) => {
        if (!hasSeason(leagueId, value.seasonId)) return 'no-season';
        const importId = id(0x1a, s.imports.length + 1);
        s.imports.push({
          id: importId,
          seasonId: value.seasonId,
          kind: 'fixtures',
          status: 'reading',
          accountId: value.accountId,
          fileName: value.fileName,
          report: value.report,
          created: { version: 1 },
          appliedAt: null,
          undoneAt: null,
          version: 1,
        });
        return { id: importId, version: 1 };
      },
      find: async (importId) => s.imports.find((x) => x.id === importId),
      save: async (importId, change, version) => {
        const at = s.imports.findIndex((x) => x.id === importId);
        const found = s.imports[at];
        if (found === undefined || found.version !== version) return undefined;
        const now = new Date().toISOString();
        s.imports[at] = {
          ...found,
          status: change.status,
          report: change.report ?? found.report,
          created: change.created ?? found.created,
          appliedAt: change.status === 'applied' ? (found.appliedAt ?? now) : found.appliedAt,
          undoneAt: change.status === 'undone' ? now : found.undoneAt,
          version: version + 1,
        };
        return version + 1;
      },
    },
    scheduling: {
      findSeason: async (seasonId) => (hasSeason(leagueId, seasonId) ? season : undefined),
      // Nothing of the made-up season has been published yet.
      latestRevision: async () => null,
      loadSchedule: async () => ({ rounds: [], games: [] }),
      findDraft: async (seasonId) => (hasSeason(leagueId, seasonId) ? s.draft : undefined),
      insertDraft: async (seasonId, changes, basedOnRevision) => {
        if (!hasSeason(leagueId, seasonId)) return 'no-season';
        if (s.draft !== undefined) return 'exists';
        s.draftsStarted += 1;
        const draftId = id(0x0f, s.draftsStarted);
        s.draft = { id: draftId, seasonId, changes, basedOnRevision, version: 1 };
        return { id: draftId, version: 1 };
      },
      updateDraft: async (_seasonId, draftId, changes, version) => {
        if (s.draft === undefined || s.draft.id !== draftId || s.draft.version !== version) {
          return undefined;
        }
        s.draft = { ...s.draft, changes, version: version + 1 };
        return version + 1;
      },
      deleteDraft: async (_seasonId, draftId, version) => {
        if (s.draft === undefined || s.draft.id !== draftId || s.draft.version !== version) {
          return false;
        }
        s.draft = undefined;
        return true;
      },
      teamsOfSeason: async (seasonId, teamIds) =>
        hasSeason(leagueId, seasonId)
          ? teamIds.filter((t) => names.teams.some((x) => x.id === t))
          : [],
      findVenue: async (venueId) => {
        const venue = ours(leagueId) ? names.venues.find((v) => v.id === venueId) : undefined;
        return venue === undefined
          ? undefined
          : {
              id: venueId,
              name: venue.name,
              address: null,
              mapLink: null,
              binned: false,
              version: 1,
            };
      },
      listCourts: async (venueId) =>
        (ours(leagueId) ? (names.venues.find((v) => v.id === venueId)?.courts ?? []) : []).map(
          (name, n) => ({
            id: id(0x7c, n + 1),
            venueId,
            name,
            sort: n,
            binned: false,
            version: 1,
          }),
        ),
    },
  });

  /** One transaction on a copy, kept only when the work did not refuse; its jobs with it. */
  async function inTransaction<T>(
    leagueId: string,
    work: (tx: ImportsTx) => Promise<T>,
  ): Promise<{ result: T; jobs: Job[] }> {
    const draft = structuredClone(stateOf(leagueId));
    const jobs: Job[] = [];
    const result = await work(txOf(leagueId, draft, jobs));
    const refused =
      typeof result === 'object' && result !== null && 'ok' in result && result.ok === false;
    if (refused) return { result, jobs: [] };
    if (ours(leagueId)) state = draft;
    return { result, jobs };
  }

  const deps: CommandDeps<ImportsTx> = {
    transaction: async <T>(context: CommandContext, work: (tx: ImportsTx) => Promise<T>) => {
      const { result, jobs } = await inTransaction(context.leagueId, work);
      // The worker's turn: each kept `imports.run` job reads its file once, in its own
      // transaction for the job's league, acting for nobody (T-226).
      for (const job of jobs) {
        const importId = job.ids['importId'];
        if (job.type === importsRunJob && importId !== undefined) {
          await inTransaction(job.leagueId, (tx) => readFixtureImport(tx, importId));
        }
      }
      return result;
    },
    events: [],
    log: options.log,
    now: () => performance.now(),
  };

  return {
    deps,
    currentSeasonOf: async (leagueId) =>
      ours(leagueId) ? { id: season.id, name: season.name } : undefined,
    namesOf: async (leagueId, seasonId): Promise<ImportNames> => {
      if (!hasSeason(leagueId, seasonId)) return { teams: {}, venues: {} };
      return {
        teams: Object.fromEntries(names.teams.map((t) => [t.id, t.name])),
        venues: Object.fromEntries(names.venues.map((v) => [v.id, v.name])),
      };
    },
    draftChangeCount: async (leagueId, seasonId) => {
      if (!hasSeason(leagueId, seasonId) || state.draft === undefined) return 0;
      return parseDraftDocument(state.draft.changes)?.changes.length ?? 0;
    },
  };
}
