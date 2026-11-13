// T-24: a module reacts to another's event without the announcing module knowing.
// The handler runs in the command's transaction (defineCommand); something that can
// wait records a job through tx.jobs instead of doing it.
import type { CommandTx, DomainEvent, EventHandler } from './ports.ts';

/** A handler for events of one type. `type` must be the type `Event` declares. */
export function onEvent<Event extends DomainEvent, Tx extends CommandTx>(
  type: Event['type'],
  handle: (event: Event, tx: Tx) => Promise<void>,
): EventHandler<Tx> {
  return {
    type,
    handle: async (event, tx) => {
      if (event.type !== type) throw new Error(`Handler for ${type} was given ${event.type}.`);
      // Checked just above: an event of this type is the shape its module declares.
      return handle(event as Event, tx);
    },
  };
}
