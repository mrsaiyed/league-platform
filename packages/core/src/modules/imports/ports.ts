// What the imports module needs from storage. packages/database supplies it, bound to one
// transaction for one league, so none of these take a league id (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';
import type { GamesStore } from '../games/index.ts';
import type { SchedulingStore } from '../scheduling/index.ts';
import type { SeasonNames } from './read-fixtures.ts';

export type ImportKind = 'fixtures' | 'people' | 'teams';
export type ImportStatus = 'reading' | 'ready' | 'applied' | 'undone' | 'failed';

/** An import as stored (T3 §11). The report and created documents are read with parseFixtureReport and parseCreatedFixtures. */
export type ImportRecord = {
  readonly id: string;
  readonly seasonId: string | null;
  readonly kind: ImportKind;
  readonly status: ImportStatus;
  readonly accountId: string;
  readonly fileName: string | null;
  /** While `reading`, holds the uploaded text (see upload-document.ts); once read, the report. */
  readonly report: unknown;
  readonly created: unknown;
  readonly appliedAt: string | null;
  readonly undoneAt: string | null;
  readonly version: number;
};

export type NewImport = {
  readonly seasonId: string;
  readonly accountId: string;
  readonly fileName: string | null;
  /** The report document to start with: the uploaded text, until the worker has read it. */
  readonly report: { readonly version: 1 } & Record<string, unknown>;
};

/** What a change to an import sets; the database stamps applied_at and undone_at itself. */
export type ImportChange = {
  readonly status: ImportStatus;
  readonly report?: { readonly version: 1 } & Record<string, unknown>;
  readonly created?: { readonly version: 1 } & Record<string, unknown>;
};

export type ImportsStore = {
  /** The program a season belongs to, or undefined if the season is not in this league. */
  readonly findSeason: (seasonId: string) => Promise<{ readonly programId: string } | undefined>;
  /** The season's teams not in the bin, and the league's venues and their courts not in the bin. */
  readonly seasonNames: (seasonId: string) => Promise<SeasonNames>;
  /** Starts an import in `reading`: its id and version (1). */
  readonly insert: (
    value: NewImport,
  ) => Promise<{ readonly id: string; readonly version: number } | 'no-season'>;
  readonly find: (importId: string) => Promise<ImportRecord | undefined>;
  /** Saves a change if the import is still at `version` (T-46): the new version, or undefined. */
  readonly save: (
    importId: string,
    change: ImportChange,
    version: number,
  ) => Promise<number | undefined>;
};

/**
 * The parts of the scheduling store an import uses: the season's draft, the published
 * schedule the draft is replayed on, and the names a draft game points at.
 */
export type ImportsSchedulingStore = Pick<
  SchedulingStore,
  | 'findSeason'
  | 'latestRevision'
  | 'findDraft'
  | 'insertDraft'
  | 'updateDraft'
  | 'deleteDraft'
  | 'loadSchedule'
  | 'teamsOfSeason'
  | 'findVenue'
  | 'listCourts'
>;

/** An imports command's transaction. */
export type ImportsTx = CommandTx & {
  readonly imports: ImportsStore;
  readonly scheduling: ImportsSchedulingStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};

/** The transaction that records waiting scores: the games store too. */
export type ImportScoresTx = ImportsTx & { readonly games: GamesStore };
