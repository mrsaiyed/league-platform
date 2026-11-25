// The players the scorer's table adds, changes and takes off (P7 §2 and §5.2; S-6,
// S-34, S-37, S-44, S-45; record 058, T-261). They come in the tracker's own batch, in
// order with the taps (games.apply_tracker_commands), and are handled here, before the
// engine, which never sees them. Whoever may score the game may make them, for its two
// teams only: the side names the team, and the batch's command has already asked
// mayScoreGame, read fresh.
//
// - Adding makes a new person, with the id the device made so its next plays can name
//   them, a number, a name, or both (S-34: a number-only player has no name at all),
//   and puts them on that side's team, marked as added at this game and, as S-6's
//   starting setting has it, to review. Step 2.71 adds the league's other two choices.
//   A number already worn never refuses the player (S-44): they are taken, and the
//   answer carries a notice naming who wears it; the season's unique-numbers rule is
//   applied when an admin confirms them (migration 0015).
// - A number is changed for any player of the team (S-37); where the season wants
//   unique numbers, one already worn is refused, saying who wears it. It is the team's
//   roster number, so this game's lines and the games after it carry it; games already
//   played keep the number they were played in.
// - A name is changed, and a player taken off, only while they were added at a
//   scorer's table and have not been reviewed by an admin (S-45): never the league's
//   own roster, never a player an admin has confirmed. Renaming keeps the name the
//   player was first given on the person, for an admin to see and put back (the player
//   still waits for review, as only such a player may be renamed). Taking off sends the
//   person to the bin (T-45), unless a play of this game names them, judged by the
//   batch's own state, they have a line in another game, or, while the game has no
//   engine state, a line in this game's box score entered from paper.
// - Nothing is taken once the game was ended earlier in the batch.
//
// Each answer that turns a change away is the refusal `rule` with a fixed `problem`
// the tracker words (T-187); `message` is for the log and holds no name (T-86). Each
// change taken is logged (A-6) with ids and fixed words, and kept as one of the game's
// events like a tap.
import {
  wornByNameMax,
  type TableNotice,
  type TablePlayerInput,
  type TablePlayerProblem,
  type WornBy,
} from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';
import { recordActivity } from '../access/index.ts';
import type { CommandContext } from '../../command/index.ts';
import { playerKey, teamOfSide } from './live-game.ts';
import type { GamePlayer, GameRecord, TablePlayer, TrackerTx } from './ports.ts';

/** A change turned away: why, the log's sentence, and who wears a number already worn. */
export type TableRefusal = {
  readonly problem: TablePlayerProblem;
  readonly message: string;
  readonly wornBy?: WornBy;
};

/** A change taken, and what the scorekeeper should know about it. */
export type TableTaken = { readonly notice?: TableNotice };

/** The game's players by team and person, as the batch changes them. */
export type MutableRoster = Map<string, GamePlayer>;

/** The longest first or last name the database keeps (0008). */
export const tableNamePartMax = 100;

/**
 * A name as typed in the one box, tidied first (NFKC, spaces), then split: the first
 * word is the first name, the rest the last name. Empty for a player known by number
 * only (S-34). Undefined when a part is longer than the database keeps, measured after
 * tidying, so a name can never grow past the limit on its way in.
 */
export function splitTableName(
  name: string,
): { readonly firstName: string; readonly lastName: string } | undefined {
  const words = name.normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
  const [first = '', ...rest] = words;
  const last = rest.join(' ');
  // Characters, as the database counts them (0008), not UTF-16 units.
  const length = (part: string) => Array.from(part).length;
  if (length(first) > tableNamePartMax || length(last) > tableNamePartMax) return undefined;
  return { firstName: first, lastName: last };
}

const fullName = (p: { readonly firstName: string; readonly lastName: string }) =>
  [p.firstName.trim(), p.lastName.trim()].filter(Boolean).join(' ');

const refusalMessages: Readonly<Record<TablePlayerProblem, string>> = {
  'jersey-taken': 'That number is already worn on this team, which wants unique numbers.',
  'needs-name-or-number': 'A player needs a number or a name.',
  'name-not-readable': 'That name is too long to keep.',
  'player-id-taken': 'That player id is already in use. Reload the roster.',
  'not-on-team': 'That player is not on this team. Reload the roster.',
  'on-team-roster':
    'This player is on the team’s own roster: their name and place are changed by a league admin.',
  reviewed:
    'A league admin has reviewed this player: their name and place are changed by a league admin.',
  'has-plays':
    'This player has plays recorded in this game, so they stay on its list and its box score.',
  'has-lines': 'This player has a line in another game, so they stay on the team.',
  'in-box-score':
    'This player has a line in this game’s box score, entered by hand, so they stay on its list.',
  'game-over': 'This game was ended earlier in the batch.',
  'player-not-added': 'This names a player whose adding was refused earlier in the batch.',
  'not-saved': 'The database could not save this change.',
};

/** A refusal with its fixed sentence for the log. */
export const tableRefusal = (problem: TablePlayerProblem, wornBy?: WornBy): TableRefusal => ({
  problem,
  message: refusalMessages[problem],
  ...(wornBy === undefined ? {} : { wornBy }),
});

/**
 * Who wears the number on the team now, other than this person: the player as the
 * tracker's rosters list them, with their name as the scorekeeper sees it there.
 */
async function wearerOf(
  tx: TrackerTx,
  game: GameRecord,
  teamId: string,
  jersey: string,
  personId: string,
): Promise<WornBy | undefined> {
  const wearer = (await tx.games.listRoster(game.id)).find(
    (p) =>
      p.teamId === teamId &&
      !p.left &&
      p.jerseyNumber === jersey &&
      p.personId.toLowerCase() !== personId,
  );
  return wearer === undefined
    ? undefined
    : { playerId: wearer.personId.toLowerCase(), jersey, name: fitWornByName(fullName(wearer)) };
}

/**
 * A wearer's name cut to what a reply may carry (`wornByNameMax`, counted in UTF-16 units
 * as the device's schema counts them), whole characters only: a name the database keeps
 * (100 characters a part) can be longer than that, and a reply the device cannot read
 * would be asked again for ever.
 */
export function fitWornByName(name: string): string {
  let fitted = '';
  for (const character of name) {
    if (fitted.length + character.length > wornByNameMax) break;
    fitted += character;
  }
  return fitted.trimEnd();
}

/** Whether a play of the state names the person: on its list of plays, or waiting to be redone. */
export function namedInState(state: basketball.GameState, personId: string): boolean {
  return [...state.plays, ...state.redo].some((play) => {
    switch (play.type) {
      case 'lineup':
        return play.playerIds.some((id) => id.toLowerCase() === personId);
      case 'sub':
        return play.inId.toLowerCase() === personId || play.outId.toLowerCase() === personId;
      case 'score':
      case 'unscore':
      case 'foul':
      case 'unfoul':
      case 'turnover':
      case 'unturnover':
        return play.playerId.toLowerCase() === personId;
      default:
        return false;
    }
  });
}

const numberOf = (jersey: string): string | null => (jersey === '' ? null : jersey);

/**
 * A random (version 4) UUID, as a device makes one. Every id the platform makes is
 * version 7, so a device id that is not version 4 could be someone's already, in this
 * league or another: it is answered `player-id-taken` without looking, so the answer
 * never says whether such an id exists anywhere (T-65).
 */
const randomId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Each change of players is logged (A-6) under the batch's command, the one that made
 * it, with ids and fixed words only: the person's name never goes into the log. The
 * game's events keep the change itself, with who sent it.
 */
const action = 'games.apply_tracker_commands';

/** Whether the scorer's table may still rename or take off this player (S-45). */
const tableProblem = (player: TablePlayer): TablePlayerProblem | undefined =>
  player.addedAtGameId === null ? 'on-team-roster' : player.needsReview ? undefined : 'reviewed';

/**
 * Applies one change of players in the batch's transaction, keeping `roster` as it now
 * is for the commands after it. What was taken, or why not.
 */
export async function applyTablePlayer(args: {
  readonly context: CommandContext;
  readonly tx: TrackerTx;
  readonly game: GameRecord;
  readonly roster: MutableRoster;
  readonly state: basketball.GameState;
  /** The game's season wants unique numbers on a team (0008). */
  readonly uniqueJerseys: boolean;
  /**
   * The game had no engine state when the batch began: its stored lines (a box score
   * entered from paper) are not rebuilt from plays, so they hold a player too.
   */
  readonly linesKept: boolean;
  readonly input: TablePlayerInput;
}): Promise<{ readonly taken: TableTaken } | { readonly refused: TableRefusal }> {
  const { context, tx, game, roster, state, uniqueJerseys, linesKept, input } = args;
  const refuse = (problem: TablePlayerProblem, wornBy?: WornBy) => ({
    refused: tableRefusal(problem, wornBy),
  });
  // Ended earlier in the batch: nothing more is taken, as the engine takes no tap.
  if (state.status === 'final') return refuse('game-over');
  const teamId = teamOfSide(game, input.side);
  const personId = input.playerId.toLowerCase();
  const target = { type: 'team', id: teamId } as const;

  if (input.type === 'add-player') {
    if (!randomId.test(personId)) return refuse('player-id-taken');
    const name = splitTableName(input.name);
    if (name === undefined) return refuse('name-not-readable');
    const jerseyNumber = numberOf(input.jersey);
    if (jerseyNumber === null && name.firstName === '') return refuse('needs-name-or-number');
    // S-44: a number already worn is said, never refused; said only where the season
    // wants unique numbers (elsewhere the screen marks a number worn twice by itself).
    const wornBy =
      jerseyNumber === null || !uniqueJerseys
        ? undefined
        : await wearerOf(tx, game, teamId, jerseyNumber, personId);
    const added = await tx.liveGames.addTablePlayer({
      personId,
      teamId,
      gameId: game.id,
      jerseyNumber,
      firstName: name.firstName,
      lastName: name.lastName,
      needsReview: true,
    });
    if (added === 'id-taken') return refuse('player-id-taken');
    if (added !== 'added') return refuse('not-saved');
    roster.set(playerKey(teamId, personId), { personId, teamId, jerseyNumber, onGameDay: true });
    await recordActivity(tx, context, {
      action,
      target,
      details: { gameId: game.id, personId, change: 'added', review: true },
    });
    return { taken: wornBy === undefined ? {} : { notice: { kind: 'jersey-also-worn', wornBy } } };
  }

  const player: TablePlayer | undefined = await tx.liveGames.findTablePlayer(teamId, personId);
  if (player === undefined) return refuse('not-on-team');

  if (input.type === 'remove-player') {
    const not = tableProblem(player);
    if (not !== undefined) return refuse(not);
    // The batch's own state, so a play undone a moment ago no longer holds them.
    if (namedInState(state, personId)) return refuse('has-plays');
    const removed = await tx.liveGames.removeTablePlayer(
      player.entryId,
      personId,
      game.id,
      linesKept,
    );
    if (removed === 'has-lines' || removed === 'in-box-score') return refuse(removed);
    if (removed !== 'removed') return refuse('not-saved');
    roster.delete(playerKey(teamId, personId));
    await recordActivity(tx, context, {
      action,
      target,
      details: { gameId: game.id, personId, change: 'removed' },
    });
    return { taken: {} };
  }

  // A change of number, name or both.
  const jerseyNumber = input.jersey === undefined ? player.jerseyNumber : numberOf(input.jersey);
  const name = input.name === undefined ? undefined : splitTableName(input.name);
  if (input.name !== undefined) {
    const not = tableProblem(player);
    if (not !== undefined) return refuse(not);
    if (name === undefined) return refuse('name-not-readable');
  }
  const firstName = name?.firstName ?? player.firstName;
  const lastName = name?.lastName ?? player.lastName;
  if (jerseyNumber === null && fullName({ firstName, lastName }) === '') {
    return refuse('needs-name-or-number');
  }
  const renumbered = jerseyNumber !== player.jerseyNumber;
  if (renumbered && jerseyNumber !== null && uniqueJerseys) {
    // S-37: only a change of number is refused, and the command looks itself, as the
    // database leaves out players waiting for review (0015).
    const wornBy = await wearerOf(tx, game, teamId, jerseyNumber, personId);
    if (wornBy !== undefined) return refuse('jersey-taken', wornBy);
  }
  const renamed = firstName !== player.firstName || lastName !== player.lastName;
  if (renumbered || renamed) {
    // The number and the name together, or neither: one command is one change.
    const done = await tx.liveGames.changeTablePlayer(player.entryId, personId, {
      ...(renumbered ? { jerseyNumber } : {}),
      ...(renamed ? { firstName, lastName } : {}),
    });
    if (done === 'jersey-taken' && jerseyNumber !== null) {
      const wornBy = await wearerOf(tx, game, teamId, jerseyNumber, personId);
      return refuse('jersey-taken', wornBy);
    }
    if (done !== 'changed') return refuse('not-saved');
  }
  const key = playerKey(teamId, personId);
  const listed = roster.get(key);
  roster.set(key, { personId, teamId, jerseyNumber, onGameDay: listed?.onGameDay ?? true });
  if (renumbered || renamed) {
    await recordActivity(tx, context, {
      action,
      target,
      details: { gameId: game.id, personId, change: 'changed', number: renumbered, name: renamed },
    });
  }
  return { taken: {} };
}
