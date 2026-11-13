// Every event handler in core (T-24), as the apps pass them to commands
// (CommandDeps.events). A handler runs in the transaction of the command whose event
// it handles, so the apps' transaction offers every store these need as well as the
// command's own. The two-league harness runs every command case with this list, and
// its coverage check fails on a handler exported from core that is not in it (T-65).
import type { EventHandler } from './command/index.ts';
import { standingsHandlers, type StandingsTx } from './modules/standings/index.ts';

export const eventHandlers: readonly EventHandler<StandingsTx>[] = [...standingsHandlers];
