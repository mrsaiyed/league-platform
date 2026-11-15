// Whether a game's event log holds a play since the game was last marked not started
// (its last `reset` event, record 061), or at all if it never was. The players the
// scorer's table added, changed or took off are events but never plays (record 058).
// The database reads the same rule in public.game_tracked_past_marker (migration 0016);
// this is it for stores that keep events in memory (the web app's stand-in, the tests).
import { tablePlayerEventTypes } from '@srleagues/contracts';
import type { NewGameEvent } from './ports.ts';

const tableTypes: readonly string[] = tablePlayerEventTypes;

export function hasPlaysPastMarker(events: readonly NewGameEvent[], gameId: string): boolean {
  const own = events.filter((e) => e.gameId === gameId);
  const marker = Math.max(0, ...own.filter((e) => e.type === 'reset').map((e) => e.seq));
  return own.some((e) => e.seq > marker && !tableTypes.includes(e.type));
}
