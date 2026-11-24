// "Confirm and start scoring" at the table (step 2.119, T-344): a device never starts a
// game on a format that is no longer the game's. With signal it reads the game's format
// again first; when that is not the format shown, or not the rules the device would
// play, it does not start and hands back the new format to show and confirm again. With
// no signal it starts on what it has: a scorekeeper is never blocked by bad signal, and
// the server's answer to the first taps brings the rules it fixed (the controller's
// `formatChangedTo`).
import type { GameFormatRules, GameFormatView } from '@srleagues/contracts';
import type { GameFormatClient } from './format-client.ts';

export type StartCheck =
  | { readonly kind: 'start' }
  | { readonly kind: 'changed'; readonly view: GameFormatView };

/**
 * `shown`: the format the confirmation lists, null while only the device's lines are
 * shown; `playing`: whether the device would play under a format.
 */
export async function checkBeforeStart(
  client: GameFormatClient,
  shown: GameFormatRules | null,
  playing: (format: GameFormatRules) => boolean,
): Promise<StartCheck> {
  const outcome = await client.read();
  // No answer, or one with no format in it: the start tap goes as it would have.
  if (outcome.kind !== 'format') return { kind: 'start' };
  const now = outcome.view.applies;
  const same = (shown === null || sameData(shown, now)) && playing(now);
  return same ? { kind: 'start' } : { kind: 'changed', view: outcome.view };
}

/** Whether two plain data values are the same, whatever the order of their keys. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameData(item, b[i]))
    );
  }
  const entries = (o: object) => Object.entries(o).filter(([, v]) => v !== undefined);
  const left = entries(a);
  const right = new Map(entries(b));
  return (
    left.length === right.size && left.every(([k, v]) => right.has(k) && sameData(v, right.get(k)))
  );
}
