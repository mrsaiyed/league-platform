// The players the scorer's table adds, changes and takes off (P7 §2 and §5.2; S-6,
// S-34, S-37; record 058, T-261). They come in the tracker's own batch, in order with
// the taps (games.apply_tracker_commands), and are handled here, before the engine,
// which never sees them. Whoever may score the game may make them, for its two teams
// only: the side names the team, and the batch's command has already asked
// mayScoreGame, read fresh.
//
// - Adding makes a new person, with the id the device made so its next plays can name
//   them, a number, a name, or both (S-34: a number-only player has no name at all),
//   and puts them on that side's team, marked as added at this game and, as S-6's
//   starting setting has it, to review. Step 2.71 adds the league's other two choices.
// - A number is changed for any player of the team (S-37); where the season wants
//   unique numbers, one already worn is refused with a sentence naming who wears it.
//   It is the team's roster number, so this game's lines and the games after it carry
//   it; games already played keep the number they were played in.
// - A name is changed only for a player added at a scorer's table: everyone else's
//   name is the league's record, changed by those who manage people.
// - Taking off is only for a player added at this game's table, as a mistake undone:
//   their entry goes, and their person with it when nothing else holds them. A player
//   a play of this game names (on its list of plays, or waiting to be redone) stays,
//   so their box score line never vanishes: the scorekeeper is told why.
//
// Each answer that turns a change away is the refusal `rule` with a fixed `problem`
// the tracker words (T-187); `message` is for the log. Each change taken is logged
// (A-6), and kept as one of the game's events like a tap.
import type { TablePlayerInput, TablePlayerProblem } from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';
import { recordActivity } from '../access/index.ts';
import type { CommandContext } from '../../command/index.ts';
import { playerKey, teamOfSide } from './live-game.ts';
import type { GamePlayer, GameRecord, TablePlayer, TrackerTx } from './ports.ts';

/** A change turned away: why, the log's sentence, and who wears a number already worn. */
export type TableRefusal = {
  readonly problem: TablePlayerProblem;
  readonly message: string;
  readonly wornBy?: string;
};

/** The game's players by team and person, as the batch changes them. */
export type MutableRoster = Map<string, GamePlayer>;

/**
 * A name as typed in the one box: the first word is the first name, the rest the last
 * name, with spaces tidied. Empty for a player known by number only (S-34).
 */
export function splitTableName(name: string): {
  readonly firstName: string;
  readonly lastName: string;
} {
  const words = name.normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
  const [first = '', ...rest] = words;
  return { firstName: first, lastName: rest.join(' ') };
}

const fullName = (p: { readonly firstName: string; readonly lastName: string }) =>
  [p.firstName.trim(), p.lastName.trim()].filter(Boolean).join(' ');

const refusalMessages: Readonly<Record<Exclude<TablePlayerProblem, 'jersey-taken'>, string>> = {
  'needs-name-or-number': 'A player needs a number or a name.',
  'player-id-taken': 'That player id is already in use. Reload the roster.',
  'not-on-team': 'That player is not on this team. Reload the roster.',
  'not-added-here':
    'Only a player added at this game’s table can be taken off its list. A league admin changes the team’s roster.',
  'name-from-roster': 'This player’s name comes from the team’s roster. A league admin changes it.',
  'has-plays':
    'This player has plays recorded in this game, so they stay on its list and its box score.',
};

const refuse = (problem: Exclude<TablePlayerProblem, 'jersey-taken'>): TableRefusal => ({
  problem,
  message: refusalMessages[problem],
});

/**
 * Who wears the number on the team, read after the database turned it away, and the
 * plain sentence naming them (S-37). The scorekeeper sees full rosters, so the name is
 * the one on the roster; a player known by number only is "another player".
 */
async function jerseyTaken(
  tx: TrackerTx,
  game: GameRecord,
  teamId: string,
  jersey: string,
  personId: string,
): Promise<TableRefusal> {
  const wearer = (await tx.games.listRoster(game.id)).find(
    (p) =>
      p.teamId === teamId &&
      !p.left &&
      p.jerseyNumber === jersey &&
      p.personId.toLowerCase() !== personId,
  );
  const name = wearer === undefined ? '' : fullName(wearer);
  return {
    problem: 'jersey-taken',
    message:
      name === ''
        ? `Number ${jersey} is already worn by another player on this team.`
        : `Number ${jersey} is already worn by ${name} on this team.`.slice(0, 300),
    ...(wearer === undefined ? {} : { wornBy: wearer.personId.toLowerCase() }),
  };
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
 * Each change of players is logged (A-6) under the batch's command, the one that made
 * it, with ids and fixed words only: the person's name never goes into the log. The
 * game's events keep the change itself, with who sent it.
 */
const action = 'games.apply_tracker_commands';

/**
 * Applies one change of players in the batch's transaction, keeping `roster` as it now
 * is for the commands after it. Undefined when it is taken; otherwise why not.
 */
export async function applyTablePlayer(args: {
  readonly context: CommandContext;
  readonly tx: TrackerTx;
  readonly game: GameRecord;
  readonly roster: MutableRoster;
  readonly state: basketball.GameState;
  readonly input: TablePlayerInput;
}): Promise<TableRefusal | undefined> {
  const { context, tx, game, roster, state, input } = args;
  const teamId = teamOfSide(game, input.side);
  const personId = input.playerId.toLowerCase();
  const target = { type: 'team', id: teamId } as const;

  if (input.type === 'add-player') {
    const { firstName, lastName } = splitTableName(input.name);
    const jerseyNumber = numberOf(input.jersey);
    if (jerseyNumber === null && firstName === '') return refuse('needs-name-or-number');
    const added = await tx.liveGames.addTablePlayer({
      personId,
      teamId,
      gameId: game.id,
      jerseyNumber,
      firstName,
      lastName,
      needsReview: true,
    });
    if (added === 'jersey-taken' && jerseyNumber !== null) {
      return jerseyTaken(tx, game, teamId, jerseyNumber, personId);
    }
    if (added !== 'added') return refuse('player-id-taken');
    roster.set(playerKey(teamId, personId), { personId, teamId, jerseyNumber, onGameDay: true });
    await recordActivity(tx, context, {
      action,
      target,
      details: { gameId: game.id, personId, change: 'added', review: true },
    });
    return undefined;
  }

  const player: TablePlayer | undefined = await tx.liveGames.findTablePlayer(teamId, personId);
  if (player === undefined) return refuse('not-on-team');

  if (input.type === 'remove-player') {
    if (player.addedAtGameId?.toLowerCase() !== game.id.toLowerCase()) {
      return refuse('not-added-here');
    }
    if (namedInState(state, personId)) return refuse('has-plays');
    const removed = await tx.liveGames.removeTablePlayer(player.entryId, personId);
    if (removed !== 'removed') return refuse('has-plays');
    roster.delete(playerKey(teamId, personId));
    await recordActivity(tx, context, {
      action,
      target,
      details: { gameId: game.id, personId, change: 'removed' },
    });
    return undefined;
  }

  // A change of number, name or both.
  const jerseyNumber = input.jersey === undefined ? player.jerseyNumber : numberOf(input.jersey);
  const name = input.name === undefined ? undefined : splitTableName(input.name);
  if (name !== undefined && player.addedAtGameId === null) return refuse('name-from-roster');
  const firstName = name?.firstName ?? player.firstName;
  const lastName = name?.lastName ?? player.lastName;
  if (jerseyNumber === null && fullName({ firstName, lastName }) === '') {
    return refuse('needs-name-or-number');
  }
  if (jerseyNumber !== player.jerseyNumber) {
    const set = await tx.liveGames.setTablePlayerNumber(player.entryId, jerseyNumber);
    if (set === 'jersey-taken' && jerseyNumber !== null) {
      return jerseyTaken(tx, game, teamId, jerseyNumber, personId);
    }
    if (set !== 'changed') return refuse('not-on-team');
  }
  const renamed = firstName !== player.firstName || lastName !== player.lastName;
  if (renamed) await tx.liveGames.renameTablePlayer(personId, firstName, lastName);
  const key = playerKey(teamId, personId);
  const listed = roster.get(key);
  roster.set(key, { personId, teamId, jerseyNumber, onGameDay: listed?.onGameDay ?? true });
  if (jerseyNumber !== player.jerseyNumber || renamed) {
    await recordActivity(tx, context, {
      action,
      target,
      details: {
        gameId: game.id,
        personId,
        change: 'changed',
        number: jerseyNumber !== player.jerseyNumber,
        name: renamed,
      },
    });
  }
  return undefined;
}
