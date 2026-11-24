// The players at the scorer's table as data the Players panel shows (step 2.118; P7 §2
// and §5.2; S-6, S-34, S-37, S-44, S-45). No drawing and no words here: a rule that
// says no gives a message key (T-187).
//
// - The list is always the rosters the device keeps with this device's changes on top
//   that the server has not answered for yet (`withChanges`), so a reload with no
//   signal shows what was typed.
// - A number worn twice on a team is marked on both players and never stops an add
//   (S-44). Only a change of number to one worn, where the season wants unique numbers,
//   is said no to, naming who wears it (S-37).
// - Only a player added at a scorer's table and not yet reviewed is renamed or taken off
//   there, and taken off only with no play in this game (S-45); otherwise the reason.
// - A play the server refused because the change that would have added its player was
//   refused is listed under that change (`refusedChanges`).
import {
  isTablePlayerCommand,
  type TablePlayerCommand,
  type TablePlayerInput,
  type TablePlayerProblem,
} from '@srleagues/contracts';
import { namedInState, splitTableName } from '@srleagues/core';
import type { MessageKey, Translate } from '@srleagues/site';
import type { basketball } from '@srleagues/sports';
import type { DevicePlayer, DeviceRosters, DeviceTeam } from './opened-game-storage.ts';
import type { KeptTap } from './queue-storage.ts';
import type { RefusedCommand } from './tracker-queue.ts';

export type PlayerSide = 'home' | 'away';

/** A key worded with no count: what each refusal and reason here is. */
export type WordKey = Parameters<Translate>[0];

/** A change of players as the panel asks for it: the device makes a new player's id. */
export type PlayerChange =
  | Omit<Extract<TablePlayerInput, { type: 'add-player' }>, 'playerId'>
  | Exclude<TablePlayerInput, { type: 'add-player' }>;

/** The message key that words a problem of a change of players. */
export const playerProblemKey = (problem: TablePlayerProblem) =>
  `tracker.players.refused.${problem}` as const satisfies MessageKey;

/** What the device says no to itself, as the server would (its rules, table-players.ts). */
export type DeviceProblem = {
  readonly problem: TablePlayerProblem;
  readonly key: WordKey;
  /** For a number already worn where the season wants unique numbers (S-37). */
  readonly wornBy?: { readonly playerId: string; readonly jersey: string };
};

const problemOf = (problem: TablePlayerProblem, wornBy?: DeviceProblem['wornBy']): DeviceProblem =>
  wornBy === undefined
    ? { problem, key: playerProblemKey(problem) }
    : { problem, key: playerProblemKey(problem), wornBy };

/** Yes, or why not. */
export type PlayerRule = { readonly ok: true } | ({ readonly ok: false } & DeviceProblem);

const yes: PlayerRule = { ok: true };
const no = (problem: TablePlayerProblem): PlayerRule => ({ ok: false, ...problemOf(problem) });

/**
 * The numbers of one line, as typed for a bench entered by number ("3 5 10 12 14"):
 * split at spaces and commas, each once, in the order typed.
 */
export function numbersOfLine(line: string): string[] {
  const seen = new Set<string>();
  for (const part of line.split(/[\s,;]+/u)) if (part !== '') seen.add(part);
  return [...seen];
}

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const teamOn = (rosters: DeviceRosters, side: PlayerSide): DeviceTeam =>
  side === 'home' ? rosters.home : rosters.away;

/** The players of `team` on it now who wear `jersey`, but for `except`. */
export function wornOn(team: DeviceTeam, jersey: string, except?: string): DevicePlayer[] {
  if (jersey === '') return [];
  return team.players.filter(
    (p) =>
      !p.left && p.jerseyNumber === jersey && (except === undefined || !sameId(p.personId, except)),
  );
}

/** Whether the table may change this player's name (S-45). */
export const mayRename = (player: DevicePlayer): PlayerRule =>
  player.addedAtGameId === null ? no('on-team-roster') : player.toReview ? yes : no('reviewed');

/** Whether the table may take this player off the team (S-45): never one this game names. */
export function mayTakeOff(player: DevicePlayer, game: basketball.GameState | null): PlayerRule {
  const rename = mayRename(player);
  if (!rename.ok) return rename;
  if (game !== null && namedInState(game, player.personId.toLowerCase())) return no('has-plays');
  return yes;
}

const withTeam = (rosters: DeviceRosters, side: PlayerSide, team: DeviceTeam): DeviceRosters =>
  side === 'home' ? { ...rosters, home: team } : { ...rosters, away: team };

/**
 * One change applied to the rosters as the server applies it, if it would take it. It
 * is the same applied twice (an add already there is not added again), so changes the
 * server took can be laid again over rosters that may already have them.
 */
function withChange(rosters: DeviceRosters, input: TablePlayerInput, gameId: string) {
  const team = teamOn(rosters, input.side);
  const index = team.players.findIndex((p) => sameId(p.personId, input.playerId));
  if (input.type === 'add-player') {
    const name = splitTableName(input.name);
    if (index >= 0 || name === undefined) return rosters;
    const added: DevicePlayer = {
      personId: input.playerId.toLowerCase(),
      ...name,
      jerseyNumber: input.jersey === '' ? null : input.jersey,
      left: false,
      addedAtGameId: gameId,
      toReview: true,
    };
    return withTeam(rosters, input.side, { ...team, players: [...team.players, added] });
  }
  const player = team.players[index];
  if (player === undefined) return rosters;
  const players = [...team.players];
  if (input.type === 'remove-player') {
    players.splice(index, 1);
  } else {
    const name = input.name === undefined ? undefined : splitTableName(input.name);
    players[index] = {
      ...player,
      ...(name === undefined ? {} : name),
      ...(input.jersey === undefined
        ? {}
        : { jerseyNumber: input.jersey === '' ? null : input.jersey }),
    };
  }
  return withTeam(rosters, input.side, { ...team, players });
}

/** The rosters with `changes` applied, in order: what the panel lists. */
export const withChanges = (
  rosters: DeviceRosters,
  changes: readonly TablePlayerCommand[],
  gameId: string,
): DeviceRosters => changes.reduce((r, c) => withChange(r, c.input, gameId), rosters);

/** The changes of players among `taps`, in their order. */
export const playerChangesIn = (taps: readonly KeptTap[]): TablePlayerCommand[] =>
  taps.map((t) => t.command).filter(isTablePlayerCommand);

/**
 * The device's own no to a change (mirroring the server's rules), or null when it goes
 * to the server, which decides. An add with a number already worn is never said no to.
 */
export function deviceProblem(
  rosters: DeviceRosters,
  input: TablePlayerInput,
  game: basketball.GameState | null,
): DeviceProblem | null {
  if (game?.status === 'final') return problemOf('game-over');
  const team = teamOn(rosters, input.side);
  if (input.type === 'add-player') {
    const name = splitTableName(input.name);
    if (name === undefined) return problemOf('name-not-readable');
    if (input.jersey === '' && name.firstName === '') return problemOf('needs-name-or-number');
    return null;
  }
  const player = team.players.find((p) => sameId(p.personId, input.playerId));
  if (player === undefined) return problemOf('not-on-team');
  if (input.type === 'remove-player') {
    const rule = mayTakeOff(player, game);
    return rule.ok ? null : problemOf(rule.problem);
  }
  let name: { readonly firstName: string; readonly lastName: string } = player;
  if (input.name !== undefined) {
    const rule = mayRename(player);
    if (!rule.ok) return problemOf(rule.problem);
    const split = splitTableName(input.name);
    if (split === undefined) return problemOf('name-not-readable');
    name = split;
  }
  const jersey = input.jersey === undefined ? (player.jerseyNumber ?? '') : input.jersey;
  if (jersey === '' && `${name.firstName}${name.lastName}`.trim() === '') {
    return problemOf('needs-name-or-number');
  }
  if (rosters.uniqueJerseys && jersey !== '' && jersey !== player.jerseyNumber) {
    const wearer = wornOn(team, jersey, player.personId)[0];
    if (wearer !== undefined)
      return problemOf('jersey-taken', { playerId: wearer.personId, jersey });
  }
  return null;
}

/** One player as the panel shows them. */
export type PanelPlayer = {
  readonly player: DevicePlayer;
  /** Added or changed here and not answered for yet by the server. */
  readonly waiting: boolean;
  /** Every other player of the team wearing the same number (S-44): marked on both. */
  readonly clashWith: readonly string[];
  readonly rename: PlayerRule;
  readonly takeOff: PlayerRule;
};

export type PanelTeam = {
  readonly side: PlayerSide;
  readonly teamId: string;
  readonly name: string;
  readonly players: readonly PanelPlayer[];
};

/** A change the server refused, with the plays refused because of it (record 058). */
export type RefusedGroup = {
  /** The player the change names (a new player's id for an add). */
  readonly playerId: string;
  /** The refused change; null when only plays naming the player are left in the list. */
  readonly change: RefusedCommand | null;
  readonly key: WordKey;
  readonly plays: readonly RefusedCommand[];
};

export type PlayersPanel = {
  readonly home: PanelTeam;
  readonly away: PanelTeam;
  readonly uniqueJerseys: boolean;
  /** Null while the panel takes changes; else why not, as a message key. */
  readonly readOnly: { readonly reason: 'final' | 'device'; readonly key: WordKey } | null;
  readonly refused: readonly RefusedGroup[];
};

/** The refused changes of players, each with the plays refused because of it. */
export function refusedChanges(refused: readonly RefusedCommand[]): RefusedGroup[] {
  const groups: { playerId: string; change: RefusedCommand | null; plays: RefusedCommand[] }[] = [];
  const groupOf = (playerId: string, change: RefusedCommand | null) => {
    const found = groups.find(
      (g) =>
        sameId(g.playerId, playerId) ||
        (change !== null && g.change?.command.commandId === change.command.commandId),
    );
    if (found !== undefined) {
      if (found.change === null) found.change = change;
      return found;
    }
    const group = { playerId, change, plays: [] as RefusedCommand[] };
    groups.push(group);
    return group;
  };
  for (const r of refused) {
    if (isTablePlayerCommand(r.command)) groupOf(r.command.input.playerId, r);
  }
  for (const r of refused) {
    if (isTablePlayerCommand(r.command) || r.refusal.problem !== 'player-not-added') continue;
    const follows = refused.find(
      (c) =>
        r.refusal.follows !== undefined &&
        sameId(c.command.commandId, r.refusal.follows) &&
        isTablePlayerCommand(c.command),
    );
    const playerId =
      follows !== undefined && isTablePlayerCommand(follows.command)
        ? follows.command.input.playerId
        : (r.refusal.playerId ?? r.command.commandId);
    groupOf(playerId, follows ?? null).plays.push(r);
  }
  return groups.map((g) => ({
    ...g,
    key: playerProblemKey(g.change?.refusal.problem ?? 'player-not-added'),
  }));
}

/**
 * The panel's data: the rosters with this device's waiting changes on top (the
 * controller's `rosters` already has them), each player's marks and rules, whether it
 * takes changes, and what the server refused.
 */
export function playersPanel(args: {
  readonly rosters: DeviceRosters;
  readonly waiting: readonly KeptTap[];
  readonly refused: readonly RefusedCommand[];
  readonly game: basketball.GameState | null;
  /** Whether this device scores the game now (the controller's mode). */
  readonly scoring: boolean;
}): PlayersPanel {
  const { rosters, game } = args;
  const pending = new Set(playerChangesIn(args.waiting).map((c) => c.input.playerId.toLowerCase()));
  const team = (side: PlayerSide): PanelTeam => {
    const t = teamOn(rosters, side);
    return {
      side,
      teamId: t.teamId,
      name: t.name,
      players: t.players.map((player) => ({
        player,
        waiting: pending.has(player.personId.toLowerCase()),
        clashWith:
          player.left || player.jerseyNumber === null
            ? []
            : wornOn(t, player.jerseyNumber, player.personId).map((p) => p.personId),
        rename: mayRename(player),
        takeOff: mayTakeOff(player, game),
      })),
    };
  };
  const readOnly =
    game?.status === 'final'
      ? ({ reason: 'final', key: 'tracker.players.readOnly.final' } as const)
      : !args.scoring
        ? ({ reason: 'device', key: 'tracker.players.readOnly.device' } as const)
        : null;
  return {
    home: team('home'),
    away: team('away'),
    uniqueJerseys: rosters.uniqueJerseys,
    readOnly,
    refused: refusedChanges(args.refused),
  };
}
