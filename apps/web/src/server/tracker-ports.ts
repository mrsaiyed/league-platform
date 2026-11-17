// What the tracker's endpoints need from outside (step 2.32; T6 §3, §5, §6): the
// tracker's commands' dependencies, the snapshot's reads, how the league shows names,
// who a scorekeeper is to another scorekeeper, and the live publisher. The league comes
// from each call's context, never from the request body (T-23). The made-up stand-in
// fills it (stand-in-games.ts), and so does the database (database-tracker.ts, step 2.93
// part 6, record 076).
import type {
  Audience,
  Clock,
  CommandDeps,
  GameSnapshotStore,
  NamePolicy,
  TrackerTx,
} from '@srleagues/core';
import type { LivePublisher } from '@srleagues/providers';

/**
 * A game's reads with how the league shows names, for a page or a snapshot that shows a
 * person's name: on the database all read in one snapshot of the league (record 076).
 */
export type GameReads = {
  readonly store: GameSnapshotStore;
  readonly audience: Audience;
  readonly policy: NamePolicy;
};

export type TrackerPorts = {
  /** What the tracker's commands run on; the context in each call names the league. */
  readonly deps: CommandDeps<TrackerTx>;
  /**
   * The snapshot's reads, bound to this league (T-28). On the database a person's name is
   * not read here (T-81, record 076): every page and snapshot that shows one reads it
   * through gameReadsOf, with the league's own name settings.
   */
  readonly snapshotStoreOf: (leagueId: string) => GameSnapshotStore;
  /**
   * `work` over one snapshot of the league (T-81, record 076): the game's reads, the
   * league's audience and its name settings, read in the same snapshot on the database,
   * so a name is always shown by the settings as they stood at one moment.
   */
  readonly gameReadsOf: <T>(leagueId: string, work: (read: GameReads) => Promise<T>) => Promise<T>;
  /** How the league shows names on its public pages (R-14, R-15). */
  readonly namesShownOf: (
    leagueId: string,
  ) => Promise<{ readonly audience: Audience; readonly policy: NamePolicy }>;
  /** What another scorekeeper is shown of the account that holds a game (T6 §5). */
  readonly displayNameOf: (leagueId: string, accountId: string) => Promise<string>;
  /** Where each saved play is published for the people watching (T-117). */
  readonly publisher: LivePublisher;
  /** The server's clock: a snapshot's `sentAt`. */
  readonly clock: Clock;
};
