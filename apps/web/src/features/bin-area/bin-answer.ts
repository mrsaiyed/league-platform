// How "Bring it back" is answered (step 2.155 part 5, T-426): nothing rides in the address.
// The action leaves a one-time notice (server/saved-notice.ts) for the person who tapped,
// holding only the thing's id, its name as the bin listed it (read from the store before
// the restore, never from the form) and what happened, written here as `said`:
// - `back.<kind>`, `back.person.firstChild` (S-109), `back.game.<revision>.<teams>.<people>.<season id>`
//   (A-19: a game back is a schedule change; its clashes ride in the notice's `about`);
// - `not.<command>.<code>`: refused, said beside the thing's own row.
// The bin page takes it once, so a reload says nothing old, and a crafted address says nothing.
import type { BinListing } from '@srleagues/core';
import type { SavedNotice } from '../../server/saved-notice.ts';
import { t } from '../../server/messages.ts';
import {
  binKindsShown,
  gameBackOf,
  gameBackSaid,
  type BinKindShown,
  type GameBack,
} from './bin-view.ts';

export type BinAnswer =
  | {
      readonly kind: 'back';
      readonly what: BinKindShown;
      readonly id: string;
      readonly name: string;
      readonly firstChild: boolean;
      readonly game?: GameBack & { readonly seasonId: string };
      readonly clashes: readonly string[];
    }
  | { readonly kind: 'refused'; readonly id: string; readonly name: string; readonly why: string };

/** The name the bin lists a thing by: a game is its two teams, a person with no name is said so. */
export function binTitle(item: Pick<BinListing, 'kind' | 'name' | 'secondName'>): string {
  if (item.kind === 'game') {
    return t('admin.bin.game.name', { home: item.name, away: item.secondName ?? '' });
  }
  if (item.kind === 'person' && item.name === '') return t('admin.bin.person.unnamed');
  return item.name;
}

const idShape = /^[0-9a-f-]{36}$/i;

/** What a restore that went through leaves as `said`. */
export function binBackSaid(
  what: BinKindShown,
  extra: { readonly firstChild?: boolean; readonly game?: GameBack; readonly seasonId?: string },
): string {
  if (what === 'game' && extra.game !== undefined && extra.seasonId !== undefined) {
    return `back.game.${gameBackSaid(extra.game)}.${extra.seasonId}`;
  }
  return what === 'person' && extra.firstChild === true ? 'back.person.firstChild' : `back.${what}`;
}

/** What a refused restore leaves as `said`: the command and its code, as problemKey reads them. */
export const binNotSaid = (command: string, code: string): string => `not.${command}.${code}`;

/** The notice the bin page took, read back; undefined for none or one it did not leave. */
export function binAnswerOf(notice: SavedNotice | undefined): BinAnswer | undefined {
  if (notice === undefined || !idShape.test(notice.thing)) return undefined;
  const id = notice.thing;
  const name = notice.name ?? '';
  if (notice.said.startsWith('not.')) {
    const why = notice.said.slice('not.'.length);
    return /^[a-z_.]+\.[a-z-]+$/.test(why) ? { kind: 'refused', id, name, why } : undefined;
  }
  const parts = notice.said.split('.');
  if (parts[0] !== 'back') return undefined;
  const what = binKindsShown.find((kind) => kind === parts[1]);
  if (what === undefined) return undefined;
  const base = { kind: 'back' as const, what, id, name, clashes: [] as readonly string[] };
  if (what === 'person')
    return { ...base, firstChild: parts[2] === 'firstChild' && parts.length === 3 };
  if (what === 'game' && parts.length === 6) {
    const game = gameBackOf(parts.slice(2, 5).join('.'));
    const seasonId = parts[5] ?? '';
    if (game === undefined || !idShape.test(seasonId)) return undefined;
    return { ...base, firstChild: false, game: { ...game, seasonId }, clashes: notice.about ?? [] };
  }
  return parts.length === 2 ? { ...base, firstChild: false } : undefined;
}
