// The tracker's door (T6 §3, §5, §6; T-111, T-113, T-116, T-117, T-118, T-121, T-127):
// the shapes that cross between the tracker, the server and the people watching.
// The engine's commands are the ones in live-stats.ts, reused as they are; the
// players added, changed and taken off at the scorer's table (version 2, record 058,
// T-261) are this door's own.
import { z } from 'zod';
import { Envelope, Jersey } from './live-stats.ts';
import { RecordingMode } from './season-rules.ts';

const Side = z.enum(['home', 'away']);
const Id = z.uuid();
const Ms = z.number().int().nonnegative();

// ---------------------------------------------------------------- version (T-127)

/**
 * The protocol the current tracker speaks. It goes up when the shapes below change.
 * Version 2 (record 058) added the players at the scorer's table to the batch.
 */
export const trackerProtocolVersion = 2;

/**
 * T-127: the server takes the current version and the one before it, so a tracker
 * that was open before a release keeps working until the device is free to update.
 */
export const isAcceptedProtocolVersion = (
  version: number,
  current: number = trackerProtocolVersion,
): boolean =>
  Number.isInteger(version) && version >= 1 && (version === current || version === current - 1);

/**
 * Read this first, before any other schema: a body from a tracker on another version
 * may not match the current shapes at all, so only `protocolVersion` is looked at. A
 * version that fails here, or is not accepted, gets a `VersionRefusal`.
 *
 * When `trackerProtocolVersion` goes up, the previous version's shapes must be kept
 * (as a separate schema the server still parses with), because T-127 promises that
 * version keeps working.
 */
export const ProtocolProbe = z.looseObject({ protocolVersion: z.number().int().min(1) });
export type ProtocolProbe = z.infer<typeof ProtocolProbe>;

/** The refusal for a version the server does not take, listing the ones it does (T-127). */
export const buildVersionRefusal = (current: number = trackerProtocolVersion): VersionRefusal => ({
  error: 'unsupported-protocol-version',
  accepted: current > 1 ? [current - 1, current] : [current],
});

// ---------------------------------------------------------------- the batch (T-111)

/** The most commands in one batch: "a few at a time". */
export const maxCommandsPerBatch = 50;

/** One tap as sent: the scorer action with its ID and the moment it was tapped. */
export const TrackerCommand = Envelope.required({ at: true });
export type TrackerCommand = z.infer<typeof TrackerCommand>;

// ---------------------------------------------------------------- players at the table (record 058)

/**
 * A name typed at the scorer's table, in one box as the Al-Hadi tracker has it: empty
 * for a player known by number only (S-34). The server takes the first word as the
 * first name and the rest as the last name.
 */
export const TableName = z.string().trim().max(100);

/**
 * What the scorer's table changes in a game's two rosters (P7 §2 and §5.2; S-6, S-34,
 * S-37). They travel in the tracker's own queue, in order with the taps (record 058):
 * a player added with no signal is on the server before the plays that name them, and
 * each is taken once, by its command ID. The server handles them before the engine,
 * which never sees them.
 *
 * - `add-player`: a new person on that side's team, with a number, a name, or both.
 *   `playerId` is made by the device, so the plays it records next can name them before
 *   the server has answered. Marked as added at this game and to review (S-6).
 * - `change-player`: a new number (empty takes it away) or name for a player of that
 *   side's team. A name is changed only for a player added at a scorer's table.
 * - `remove-player`: takes a player added at this game's table off its list, unless a
 *   play of the game names them.
 */
export const TablePlayerInput = z.discriminatedUnion('type', [
  z
    .strictObject({
      type: z.literal('add-player'),
      side: Side,
      playerId: Id,
      jersey: Jersey,
      name: TableName,
    })
    .refine((p) => p.jersey !== '' || p.name !== '', 'Enter a name or a jersey number.'),
  z
    .strictObject({
      type: z.literal('change-player'),
      side: Side,
      playerId: Id,
      jersey: Jersey.optional(),
      name: TableName.optional(),
    })
    .refine((p) => p.jersey !== undefined || p.name !== undefined, 'Nothing to change.'),
  z.strictObject({ type: z.literal('remove-player'), side: Side, playerId: Id }),
]);
export type TablePlayerInput = z.infer<typeof TablePlayerInput>;

/** The command types of the players at the table: none is a play of the game. */
export const tablePlayerCommandTypes = ['add-player', 'change-player', 'remove-player'] as const;

/** A change of players as sent: like a tap, with its ID and when it was made. */
export const TablePlayerCommand = z.strictObject({
  commandId: Id,
  at: z.number().int().nonnegative(),
  input: TablePlayerInput,
});
export type TablePlayerCommand = z.infer<typeof TablePlayerCommand>;

/** Anything the tracker's queue sends (version 2): a tap or a change of players. */
export const BatchCommand = z.union([TrackerCommand, TablePlayerCommand]);
export type BatchCommand = z.infer<typeof BatchCommand>;

/** A change of players, told from a tap. */
export const isTablePlayerCommand = (command: BatchCommand): command is TablePlayerCommand =>
  (tablePlayerCommandTypes as readonly string[]).includes(command.input.type);

const uniqueIds = (list: readonly { readonly commandId: string }[]) =>
  new Set(list.map((c) => c.commandId)).size === list.length;

const commandList = <T extends z.ZodType<{ readonly commandId: string }>>(command: T) =>
  z
    .array(command)
    .min(1)
    .max(maxCommandsPerBatch)
    .refine(uniqueIds, { message: 'A command ID appears twice in the batch.' });

/**
 * The batch of version 1, taps only: what a tracker opened before version 2 sends.
 * Kept as it was, so that tracker keeps working (T-127).
 */
export const CommandBatchV1 = z.strictObject({
  protocolVersion: z.number().int().min(1),
  sessionId: Id,
  commands: commandList(TrackerCommand),
});

/** What the tracker posts to `POST /api/v1/leagues/{leagueId}/games/{game}/commands` (T-229). */
export const CommandBatch = z.strictObject({
  protocolVersion: z.number().int().min(1),
  sessionId: Id,
  commands: commandList(BatchCommand),
});
export type CommandBatch = z.infer<typeof CommandBatch>;

/**
 * Why a change of players was refused, as a fixed code the tracker words (T-187). The
 * refusal's code is `rule`: it is about this one command, so the queue sets it aside
 * and sends the rest.
 */
export const tablePlayerProblems = [
  /** The season wants unique numbers and someone on the team wears it (S-37): `wornBy` names them. */
  'jersey-taken',
  /** The change would leave a player with neither a number nor a name (S-34). */
  'needs-name-or-number',
  /** The new player's id is already someone's: a fault in the device. */
  'player-id-taken',
  /** No such player on that side's team now. */
  'not-on-team',
  /** Only a player added at this game's table is taken off its list here. */
  'not-added-here',
  /** The name of a player on the team's own roster is the league's to change. */
  'name-from-roster',
  /** A play of this game names the player, so they stay on its list and its box score. */
  'has-plays',
] as const;
export const TablePlayerProblem = z.enum(tablePlayerProblems);
export type TablePlayerProblem = z.infer<typeof TablePlayerProblem>;

/**
 * Why a command was refused (T-113). The tracker reloads the server's state and tells
 * the scorekeeper what was not applied; `message` is for the log, not for the screen.
 */
export const refusalCodes = [
  'rule', // the engine said no: a foul on a player not on the court, and the like
  'session-not-held', // the device no longer holds the game (T-116)
  'game-not-live', // the game has not started, or is final
  'unknown-game',
  'not-allowed', // the person may not score this game
] as const;
export const RefusalCode = z.enum(refusalCodes);
export type RefusalCode = z.infer<typeof RefusalCode>;

export const CommandResult = z.discriminatedUnion('status', [
  z.strictObject({ commandId: Id, status: z.literal('accepted') }),
  z.strictObject({ commandId: Id, status: z.literal('duplicate') }),
  z.strictObject({
    commandId: Id,
    status: z.literal('refused'),
    reason: z.strictObject({
      code: RefusalCode,
      message: z.string().max(300),
      /** A change of players only (version 2): why, for the tracker to word. */
      problem: TablePlayerProblem.optional(),
      /** With `jersey-taken`: the player who wears the number, on the tracker's rosters. */
      wornBy: Id.optional(),
    }),
  }),
]);
export type CommandResult = z.infer<typeof CommandResult>;

/** One result per command, in the order sent, and the game's sequence number after them. */
export const CommandReply = z.strictObject({
  protocolVersion: z.number().int().min(1),
  sequence: Ms,
  results: z.array(CommandResult).min(1).max(maxCommandsPerBatch),
});
export type CommandReply = z.infer<typeof CommandReply>;

/** The whole batch is turned away: a version the server no longer speaks. */
export const VersionRefusal = z.strictObject({
  error: z.literal('unsupported-protocol-version'),
  accepted: z.array(z.number().int().min(1)).min(1),
});
export type VersionRefusal = z.infer<typeof VersionRefusal>;

// ---------------------------------------------------------------- the server's own refusals (T-251)

/**
 * How our server turns a tracker request away whole (record 039): the commands, session
 * and state endpoints answer 400, 401, 403 and 404 with one of these bodies, each at its
 * own status (`trackerRefusalStatus`). The tracker takes a refusal as the server's word
 * only when it carries this body at that status (`ownTrackerRefusal`). Anything else (a
 * gym Wi-Fi sign-in page, a filter, a host's error page during a release) is no answer,
 * and is asked again: such a page must never stop scoring or set taps aside. The session
 * endpoint's own refusals that carry a `SessionReply` (403, 404, 409) are read by that body.
 *
 * These bodies are the ones the endpoints gave before this shape was written down, so a
 * tracker opened before then reads them as it always did (T-127).
 */
export const TrackerRefusal = z.discriminatedUnion('error', [
  /** No session cookie, or one that ended (401). */
  z.strictObject({ error: z.literal('signed-out') }),
  /** The person may not score this game (403). */
  z.strictObject({ error: z.literal('not-allowed') }),
  /**
   * The session is live but is none of our accounts' (403, record 055): signing in
   * again would not help. A tracker takes it as it takes "not allowed".
   */
  z.strictObject({ error: z.literal('account-problem') }),
  /** No such league or game, one of another league asked for through this one's address included (404). */
  z.strictObject({ error: z.literal('not-found') }),
  /** The body is not a request the endpoint takes (400). */
  z.strictObject({ error: z.literal('invalid-input'), issues: z.array(z.unknown()) }),
]);
export type TrackerRefusal = z.infer<typeof TrackerRefusal>;

/** The status each of the server's own refusals is answered with. */
export const trackerRefusalStatus: Readonly<Record<TrackerRefusal['error'], number>> = {
  'signed-out': 401,
  'not-allowed': 403,
  'account-problem': 403,
  'not-found': 404,
  'invalid-input': 400,
};

/**
 * The refusal `body` is when it is our server's own, answered at its own `status`;
 * null for anything else, which the tracker treats as no answer.
 */
export const ownTrackerRefusal = (status: number, body: unknown): TrackerRefusal | null => {
  const read = TrackerRefusal.safeParse(body);
  return read.success && trackerRefusalStatus[read.data.error] === status ? read.data : null;
};

// ---------------------------------------------------------------- scoring session (T-116)

/** The lease runs out this long after the last renewal: "about two minutes". */
export const sessionLeaseSeconds = 120;
/** The tracker renews this often while it is open. */
export const sessionRenewSeconds = 30;

/** The tracker's own id for its device, made once and kept on the device (T-116). */
export const DeviceId = z.string().trim().min(1).max(200);

/**
 * What the tracker posts to `POST /api/v1/leagues/{leagueId}/games/{game}/session`
 * (record 039, T-251). The address names the game, as for the commands, so no
 * request carries it again; opening and taking over name the device.
 */
export const SessionRequest = z.discriminatedUnion('type', [
  /** Open the game to score. Answered `held-by-other` if another device holds it. */
  z.strictObject({ type: z.literal('open'), deviceId: DeviceId }),
  z.strictObject({ type: z.literal('renew'), sessionId: Id }),
  /** The scorekeeper has confirmed; the other device becomes read-only at once. */
  z.strictObject({
    type: z.literal('take-over'),
    deviceId: DeviceId,
    confirmed: z.literal(true),
    /** The `since` of the holder the scorekeeper saw; the server refuses if it has changed. */
    expectedHolderSince: Ms,
  }),
  z.strictObject({ type: z.literal('release'), sessionId: Id }),
]);
export type SessionRequest = z.infer<typeof SessionRequest>;

const Holder = z.strictObject({ displayName: z.string().max(120), since: Ms });

export const SessionReply = z.discriminatedUnion('status', [
  /** This device holds the game until `expiresAt` (server time, ms). `sentAt` is server time on every reply. */
  z.strictObject({
    status: z.literal('held-by-you'),
    sessionId: Id,
    expiresAt: Ms,
    sentAt: Ms,
  }),
  /** Someone else holds it. The tracker offers to take over. */
  z.strictObject({ status: z.literal('held-by-other'), holder: Holder, sentAt: Ms }),
  /** This session no longer holds the game: taken over, run out or released. */
  z.strictObject({
    status: z.literal('ended'),
    reason: z.enum(['taken-over', 'expired', 'released']),
    sentAt: Ms,
  }),
  /**
   * Not opened: the person may not score it, there is no such game, or it cannot be
   * scored now (decided, cancelled or postponed).
   */
  z.strictObject({
    status: z.literal('refused'),
    code: z.enum(['not-allowed', 'unknown-game', 'game-not-live']),
    sentAt: Ms,
  }),
]);
export type SessionReply = z.infer<typeof SessionReply>;

// ---------------------------------------------------------------- the engine's state (T-113, T-253)

/**
 * What `GET /api/v1/leagues/{leagueId}/games/{game}/state` answers a scorekeeper
 * (record 049): the engine's state as the server holds it, which the tracker loads on
 * opening the game and reloads after a refusal (T-113). The state is the engine's own
 * document (packages/sports), which this package cannot name: only the marks of its
 * version 1 are checked here, and the tracker reads it as the engine's. Never cached,
 * and never for visitors: it names every player by id.
 */
export const TrackerGameState = z.strictObject({
  /** The sequence number of the last tap in the state; 0 while there is none. */
  sequence: Ms,
  state: z.looseObject({
    version: z.literal(1),
    status: z.enum(['scheduled', 'live', 'final']),
    rules: z.looseObject({ periods: z.number().int().min(1) }),
    clock: z.looseObject({ remainingMs: z.number(), running: z.boolean() }),
    plays: z.array(z.unknown()),
    redo: z.array(z.unknown()),
    recent: z.array(z.string()),
  }),
});
export type TrackerGameState = z.infer<typeof TrackerGameState>;

// ---------------------------------------------------------------- the rosters (record 058)

/**
 * One player of a game's two rosters as the scorekeeper's device holds them (record 054):
 * names and numbers only (R-16), those who left marked (R-17). A player added by number
 * only has an empty first and last name (S-34): the tracker shows them as "#12".
 */
export const TrackerRosterPlayer = z.strictObject({
  teamId: Id,
  personId: Id,
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  jerseyNumber: Jersey.min(1).nullable(),
  left: z.boolean(),
});

/**
 * What `GET /api/v1/leagues/{leagueId}/games/{game}/rosters` answers whoever may score
 * the game (record 058): the same rosters the tracker's page hands the device (record
 * 054), so the device can take a player added a minute ago on another device. Never
 * cached, and never for visitors: a team that shows its players to staff only is
 * listed in full.
 */
export const TrackerRosters = z.strictObject({
  gameId: Id,
  homeTeamId: Id,
  awayTeamId: Id,
  /** How the game is recorded; absent for a mode this version does not know. */
  recording: RecordingMode.optional(),
  status: z.string().max(20),
  players: z.array(TrackerRosterPlayer).max(1000),
});
export type TrackerRosters = z.infer<typeof TrackerRosters>;

// ---------------------------------------------------------------- the clock (T-121)

/**
 * The clock is sent as a reference, not every second: "running, this much left as of
 * this instant" or "stopped at this". `asOf` is server time in milliseconds; a viewer
 * counts down from it by itself.
 */
export const ClockReference = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('running'), remainingMs: Ms, asOf: Ms }),
  z.strictObject({ state: z.literal('stopped'), remainingMs: Ms }),
]);
export type ClockReference = z.infer<typeof ClockReference>;

// ---------------------------------------------------------------- what viewers see (T-117, T-118)

export const gameStatuses = ['scheduled', 'live', 'final'] as const;
export const GameStatus = z.enum(gameStatuses);
export type GameStatus = z.infer<typeof GameStatus>;

const Score = z.strictObject({ home: Ms, away: Ms });
const TeamFouls = z.strictObject({ home: Ms, away: Ms });

/**
 * The latest play, as facts. Names and numbers are only those the league and the team
 * allow to be shown (T-120); the page words it from its message file (T-187).
 *
 * The server must redact this to the most restrictive setting among everything that
 * receives it (S-22, T-87): one channel carries it to every viewer, so if either team
 * or the league hides names, numbers or points, it carries null here.
 */
export const LatestPlay = z.strictObject({
  type: z.enum(['score', 'foul', 'turnover', 'timeout', 'sub', 'period', 'other']),
  side: Side.optional(),
  playerName: z.string().max(120).nullable(),
  jersey: Jersey.min(1).nullable(),
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
export type LatestPlay = z.infer<typeof LatestPlay>;

/** The small numbered message published on a game's channel after each saved command. */
export const LiveMessage = z.strictObject({
  gameId: Id,
  /** Counts up by one per saved command; a viewer that sees a jump has missed one. */
  sequence: Ms,
  /** Server time when it was sent, in milliseconds: lets a device line its clock up. */
  sentAt: Ms,
  status: GameStatus,
  score: Score,
  period: z.number().int().min(1).max(20),
  clock: ClockReference,
  teamFouls: TeamFouls,
  latestPlay: LatestPlay.nullable(),
});
export type LiveMessage = z.infer<typeof LiveMessage>;

const SnapshotPlayer = z.strictObject({
  playerId: Id,
  side: Side,
  name: z.string().max(120).nullable(),
  jersey: z.string().max(2).nullable(),
  /**
   * Present, and true, only for a player whose name was never recorded: added at the
   * scorer's table by number only (S-34). The page shows them as "#12", not as a name
   * withheld. Absent for everyone else, so a page opened before it was added still
   * reads every snapshot without such a player.
   */
  unnamed: z.literal(true).optional(),
  /** Null means hidden for this team (S-22, T-87); never zero standing in for hidden. */
  points: Ms.nullable(),
  fouls: Ms.nullable(),
  onCourt: z.boolean(),
});

/**
 * The game as it stands at one sequence number, for a page that is arriving, has found
 * a gap, or cannot hold a live connection (T-118, T-119). It carries everything a live
 * message does, so one rule can adopt either.
 */
export const GameSnapshot = LiveMessage.extend({
  periods: z.union([z.literal(2), z.literal(4)]),
  teams: z.strictObject({
    /** `statsVisible` false: this team's players carry null points and fouls (S-22, T-87). */
    home: z.strictObject({ name: z.string().max(120), statsVisible: z.boolean() }),
    away: z.strictObject({ name: z.string().max(120), statsVisible: z.boolean() }),
  }),
  /** As of this snapshot's sequence only; later messages do not update players. */
  players: z.array(SnapshotPlayer).max(200),
  /** Set when the game was reopened and finalised again; the date only (S-7). */
  correctedOn: z.iso.date().optional(),
});
export type GameSnapshot = z.infer<typeof GameSnapshot>;
