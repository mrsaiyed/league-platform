// What the tracker's endpoints need from outside (step 2.32; T6 §3, §5, §6): the
// tracker's commands' dependencies, the snapshot's reads, how the league shows names,
// who a scorekeeper is to another scorekeeper, and the live publisher. The league comes
// from each call's context, never from the request body (T-23). Today only the
// made-up stand-in fills it; the database-backed one comes with the web app's start
// on a database.
import type {
  Audience,
  Clock,
  CommandDeps,
  GameSnapshotStore,
  NamePolicy,
  TrackerTx,
} from '@srleagues/core';
import type { LivePublisher } from '@srleagues/providers';

export type TrackerPorts = {
  /** What the tracker's commands run on; the context in each call names the league. */
  readonly deps: CommandDeps<TrackerTx>;
  /** The snapshot's reads, bound to this league (T-28). */
  readonly snapshotStoreOf: (leagueId: string) => GameSnapshotStore;
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
