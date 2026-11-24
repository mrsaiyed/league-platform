// What the Players panel does with what is typed (step 2.118, part 2; P7 §5.2, S-34,
// S-44, S-45). No drawing and no words here: the panel (players-panel.tsx) draws, the
// controller (`changePlayers`) decides, and the rules are roster-changes.ts's.
//
// - A team's add line takes one player (a number, a name, or both) or a bench typed by
//   number in one line ("3 5 10 12 14"), each added with no name (S-34).
// - A number already worn is marked while it is typed, on the typed line and on the
//   player who wears it, and never stops the add (S-44).
// - What is typed is kept as drafts, by game, so a half-typed line survives the panel
//   being shut and the page being loaded again; a line is cleared only once it is stored.
import type { DevicePlayer, DeviceRosters, DeviceTeam } from './opened-game-storage.ts';
import { numbersOfLine, wornOn, type PlayerChange, type PlayerSide } from './roster-changes.ts';

/** What is typed in the panel, by box: `home:number`, `away:name`, `fix:<id>:number`, … */
export type PlayerDrafts = Readonly<Record<string, string>>;

export const lineBox = (side: PlayerSide) => `${side}:number`;
export const nameBox = (side: PlayerSide) => `${side}:name`;
export const fixNumberBox = (playerId: string) => `fix:${playerId.toLowerCase()}:number`;
export const fixNameBox = (playerId: string) => `fix:${playerId.toLowerCase()}:name`;

/** The drafts with one box typed in; an empty box is dropped. */
export function typed(drafts: PlayerDrafts, box: string, text: string): PlayerDrafts {
  const next: Record<string, string> = { ...drafts };
  if (text === '') delete next[box];
  else next[box] = text;
  return next;
}

/** The drafts without these boxes (a line once stored, a fix once saved or shut). */
export function cleared(drafts: PlayerDrafts, boxes: readonly string[]): PlayerDrafts {
  const next: Record<string, string> = { ...drafts };
  for (const box of boxes) delete next[box];
  return next;
}

/** A team has nobody on it: the panel opens by itself (step 2.118). */
export const teamIsEmpty = (team: DeviceTeam) => team.players.every((p) => p.left);

export const someTeamIsEmpty = (rosters: DeviceRosters) =>
  teamIsEmpty(rosters.home) || teamIsEmpty(rosters.away);

/**
 * Why a team's add line is not sent as typed, or null: several numbers with a name are
 * neither a bench nor one player (the lead's decision, step 2.118 part 3), so the panel
 * says what to do instead of sending them to be refused.
 */
export function lineProblem(line: string, name: string): 'numbers-with-name' | null {
  return numbersOfLine(line).length > 1 && name.trim() !== '' ? 'numbers-with-name' : null;
}

/**
 * The changes a team's add line asks for: several numbers and no name are a bench, one
 * player each; otherwise one player with the number (or none) and the name typed.
 */
export function lineChanges(side: PlayerSide, line: string, name: string): PlayerChange[] {
  const numbers = numbersOfLine(line);
  const trimmed = name.trim();
  if (numbers.length > 1 && trimmed === '') {
    return numbers.map((jersey) => ({ type: 'add-player', side, jersey, name: '' }));
  }
  if (numbers.length > 1) {
    return [{ type: 'add-player', side, jersey: line.trim(), name: trimmed }];
  }
  return [{ type: 'add-player', side, jersey: numbers[0] ?? '', name: trimmed }];
}

/** A number typed that a player of the team already wears: marked, never refused (S-44). */
export type TypedClash = { readonly jersey: string; readonly wornBy: readonly DevicePlayer[] };

/** The numbers of a typed line that are worn on the team now, in the order typed. */
export function typedClashes(team: DeviceTeam, line: string, except?: string): TypedClash[] {
  return numbersOfLine(line)
    .map((jersey) => ({ jersey, wornBy: wornOn(team, jersey, except) }))
    .filter((c) => c.wornBy.length > 0);
}

/** The ids of the players a typed line clashes with, to mark on them too (S-44). */
export const clashedIds = (clashes: readonly TypedClash[]): Set<string> =>
  new Set(clashes.flatMap((c) => c.wornBy.map((p) => p.personId.toLowerCase())));

/**
 * The change a fix of one player asks for, or null when nothing differs from what they
 * have. A name box left as it was is not sent, so a league player's number is fixed
 * without touching a name the table may not change (S-45).
 */
export function fixChange(
  side: PlayerSide,
  player: DevicePlayer,
  jersey: string | undefined,
  name: string | undefined,
): PlayerChange | null {
  const wasName = `${player.firstName} ${player.lastName}`.trim();
  const newJersey =
    jersey === undefined || jersey.trim() === (player.jerseyNumber ?? '')
      ? undefined
      : jersey.trim();
  const newName = name === undefined || name.trim() === wasName ? undefined : name.trim();
  if (newJersey === undefined && newName === undefined) return null;
  return {
    type: 'change-player',
    side,
    playerId: player.personId,
    ...(newJersey === undefined ? {} : { jersey: newJersey }),
    ...(newName === undefined ? {} : { name: newName }),
  };
}

/** The place a game's drafts are kept on this device (a convenience: losing it loses only typing). */
export const draftsKey = (gameId: string) => `srleagues.tracker.players-drafts.${gameId}`;

type DraftStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The drafts kept for a game; none when there are none or the storage cannot be read. */
export function readDrafts(store: DraftStore | null, gameId: string): PlayerDrafts {
  try {
    const text = store?.getItem(draftsKey(gameId));
    if (text === null || text === undefined) return {};
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const drafts: Record<string, string> = {};
    for (const [box, value] of Object.entries(parsed)) {
      if (typeof value === 'string') drafts[box] = value;
    }
    return drafts;
  } catch {
    return {};
  }
}

/** Keeps the drafts; a storage that says no loses only the typing, never a stored change. */
export function writeDrafts(store: DraftStore | null, gameId: string, drafts: PlayerDrafts): void {
  try {
    if (Object.keys(drafts).length === 0) store?.removeItem(draftsKey(gameId));
    else store?.setItem(draftsKey(gameId), JSON.stringify(drafts));
  } catch {
    // Private windows and full storage: the boxes still hold the text until the page goes.
  }
}
