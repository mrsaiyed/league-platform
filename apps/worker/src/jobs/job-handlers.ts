// The handler for each job type the worker carries out (T7 §2). `email.send` has one kind
// today, the invitation email (ids `{ invitationId }`); other emails come with their own ids
// and are told apart here. `imports.run` reads an uploaded fixtures file (ids `{ importId }`)
// and is offered when the worker is given an imports transaction. `bin.empty` removes what has
// been in a league's bin for 30 days and is offered when the worker is given the bin's transaction.
// `cache.clear` clears a decided or reopened game's season pages from the cache in front of the
// site (ids `{ seasonId, gameId }`, step 2.26) and is always offered.
import {
  binEmptyJob,
  importsRunJob,
  invitationEmailJob,
  pageCacheClearJob,
  type BinTx,
  type ImportsTx,
  type JobHandlers,
  type TransactionRunner,
} from '@srleagues/core';
import type { PageCache } from '@srleagues/providers';
import { runBinEmptying } from './bin-job.ts';
import { runCacheClear } from './cache-clear-job.ts';
import { runImport } from './import-job.ts';
import { sendInvitationEmail, type InvitationEmailDeps } from './invitation-email-job.ts';

export type JobHandlerDeps = InvitationEmailDeps & {
  /** The cache in front of the site (the local stand-in, nothing, or Cloudflare). */
  readonly pageCache: PageCache;
  readonly importsTransaction?: TransactionRunner<ImportsTx>;
  /** Offered with the clock it runs by: the nightly emptying of the bin (step 2.76). */
  readonly bin?: { readonly transaction: TransactionRunner<BinTx>; readonly now: () => Date };
};

export function jobHandlers(deps: JobHandlerDeps): JobHandlers {
  return {
    [invitationEmailJob]: sendInvitationEmail(deps),
    [pageCacheClearJob]: runCacheClear({ pageCache: deps.pageCache }),
    ...(deps.importsTransaction === undefined
      ? {}
      : { [importsRunJob]: runImport({ transaction: deps.importsTransaction }) }),
    ...(deps.bin === undefined ? {} : { [binEmptyJob]: runBinEmptying(deps.bin) }),
  };
}
