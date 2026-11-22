// The shape of release-run.mjs, for the TypeScript tests that call it (step 2.95).
import type { MigrationTargetSource } from '@srleagues/database';

export type CommitToDeploy =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly problem: 'not-a-checkout' | 'migrations-changed' };

export type ReleaseRun = {
  readonly source: MigrationTargetSource;
  readonly commit: () => CommitToDeploy;
  readonly ask: (question: string) => Promise<string>;
  readonly folder?: string;
  /** --go-ahead: live games above the limit do not stop it (T-158). */
  readonly goAhead?: boolean;
  readonly say?: (line: string) => void;
  readonly warn?: (line: string) => void;
};

/** T-158: the most live games, in all leagues, for a release without --go-ahead. */
export declare const mostLiveGames: number;

/** A short error code only (SQLSTATE or Node's), never a message. */
export function codeOf(error: unknown): string | undefined;

/** The release's database part; resolves to the exit code. */
export function runRelease(run: ReleaseRun): Promise<number>;
