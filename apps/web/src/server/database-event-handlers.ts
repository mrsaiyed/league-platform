// Core's event handlers for every command run on the database (T-24, step 2.93's last
// part): the one place every database port takes its `events` from, as the made-up world
// gives every command core's handlers from one place (stand-in-world.ts). A handler runs
// inside the transaction of the command whose event it handles, so each port's command
// transaction holds the stores the handlers read and write (the standings, the games
// module's results, access and the activity log) besides its own. No port is given an
// empty list: the day a setting or a schedule change raises an event that must re-rank a
// table, the database does what the made-up world does, not silently less
// (`database-event-handlers.test.ts` fails on a port given none, or a list made elsewhere).
import {
  eventHandlers,
  type CommandTx,
  type EventHandler,
  type StandingsTx,
} from '@srleagues/core';

/** The stores core's handlers need in a command's transaction (StandingsTx's own). */
const handlerStores = ['standings', 'games', 'access', 'activity'] as const;

/** Whether a command's transaction holds every store core's handlers use. */
const holdsHandlerStores = (tx: CommandTx): tx is CommandTx & StandingsTx =>
  handlerStores.every((store) => store in tx && (tx as Record<string, unknown>)[store] != null);

/** The lists made here, so a test can tell them from a list made anywhere else. */
const madeHere = new WeakSet<readonly EventHandler<never>[]>();

/**
 * Core's handlers for one port's commands. A command hands a handler its own copy of the
 * transaction with a checked job queue (define-command.ts), so every store is still there;
 * a transaction without the handlers' stores is a wiring mistake and is thrown, never
 * skipped.
 */
export function coreEventHandlers<Tx extends CommandTx>(): readonly EventHandler<Tx>[] {
  const handlers: readonly EventHandler<Tx>[] = eventHandlers.map((handler) => ({
    type: handler.type,
    handle: async (event, tx) => {
      if (!holdsHandlerStores(tx)) {
        throw new Error('A command transaction without the stores of core’s event handlers.');
      }
      await handler.handle(event, tx);
    },
  }));
  madeHere.add(handlers as readonly EventHandler<never>[]);
  return handlers;
}

/** Whether `events` is a list this file made: for the test of every database port. */
export function isCoreEventHandlers(events: readonly EventHandler<never>[]): boolean {
  return madeHere.has(events);
}
