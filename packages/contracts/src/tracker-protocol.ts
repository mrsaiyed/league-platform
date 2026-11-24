// The tracker's door (T6 §3, §5, §6; T-111, T-113, T-116, T-117, T-118, T-121, T-127):
// the shapes that cross between the tracker, the server and the people watching.
// The engine's commands are the ones in live-stats.ts, reused as they are: the
// platform's shape (`PlatformEnvelope`), with the clock-mode switch (record 062,
// T-265); the players added, changed and taken off at the scorer's table (version 2,
// record 058, T-261) are this door's own.
import { z } from 'zod';
import { Envelope, Jersey, PlatformEnvelope } from './live-stats.ts';
import { RecordingMode } from './season-rules.ts';

const Side = z.enum(['home', 'away']);
const Id = z.uuid();
const Ms = z.number().int().nonnegative();

// ---------------------------------------------------------------- version (T-127)

/**
 * The protocol the current tracker speaks. It goes up when the shapes below change.
 * Version 2 (record 058) added the players at the scorer's table to the batch. Its taps
 * took the platform's command shape later (record 062): only more is taken, so every
 * batch a version 2 tracker sends is read and answered as before, and it stays 2.
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

/**
 * One tap as sent: the scorer action with its ID and the moment it was tapped, in the
 * platform's command shape (T-128, record 062): the Al-Hadi tracker's commands and the
 * clock-mode switch, which the engine records as a play (S-21).
 */
export const TrackerCommand = PlatformEnvelope.required({ at: true });
export type TrackerCommand = z.infer<typeof TrackerCommand>;

/**
 * A tap of version 1, kept as it was (T-127): the Al-Hadi tracker's command shape,
 * which has no clock-mode switch.
 */
export const TrackerCommandV1 = Envelope.required({ at: true });

// ---------------------------------------------------------------- players at the table (record 058)

/**
 * A name typed at the scorer's table, in one box as the Al-Hadi tracker has it: empty
 * for a player known by number only (S-34). The server tidies it (NFKC, spaces) before
 * it measures it, takes the first word as the first name and the rest as the last name,
 * and refuses one whose parts do not fit (`name-not-readable`), so a long name is one
 * refused change, never a batch turned away. The limit here only keeps a batch small.
 */
export const TableName = z.string().max(400);

/** Whether a table name has anything in it once its spaces are taken away. */
const hasName = (name: string) => name.trim() !== '';

/**
 * What the scorer's table changes in a game's two rosters (P7 §2 and §5.2; S-6, S-34,
 * S-37). They travel in the tracker's own queue, in order with the taps (record 058):
 * a player added with no signal is on the server before the plays that name them, and
 * each is taken once, by its command ID. The server handles them before the engine,
 * which never sees them.
 *
 * - `add-player`: a new person on that side's team, with a number, a name, or both.
 *   `playerId` is a random (version 4) UUID the device makes, so the plays it records
 *   next can name them before the server has answered; any other id is refused as
 *   taken. Marked as added at this game and to review (S-6).
 * - `change-player`: a new number (empty takes it away) or name for a player of that
 *   side's team. A name is changed only for a player added at a scorer's table and not
 *   yet reviewed by an admin (S-45).
 * - `remove-player`: takes such a player off the team (to the bin), unless a play of
 *   this game names them or they have a line in another game (S-45).
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
    .refine((p) => p.jersey !== '' || hasName(p.name), 'Enter a name or a jersey number.'),
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

/**
 * The event an add the server refused is kept as (record 058): so a retry is answered
 * the same way, and a later batch's commands naming that player still point at it.
 * Like the changes of players, it is not a play.
 */
export const refusedAddEventType = 'add-player-refused';

/** Every event type of the players at the table: none is a play of the game. */
export const tablePlayerEventTypes = [...tablePlayerCommandTypes, refusedAddEventType] as const;

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
  commands: commandList(TrackerCommandV1),
});

/** What the tracker posts to `POST /api/v1/leagues/{leagueId}/games/{game}/commands` (T-229). */
export const CommandBatch = z.strictObject({
  protocolVersion: z.number().int().min(1),
  sessionId: Id,
  /**
   * The account the device kept these taps for (T-323). The session decides who scores:
   * a batch whose maker is not its session's account is refused, never taken under it.
   * Left out by a tracker opened before (T-127).
   */
  accountId: Id.optional(),
  commands: commandList(BatchCommand),
});
export type CommandBatch = z.infer<typeof CommandBatch>;

/**
 * Why a change of players, or a play naming a player, was refused, as a fixed code the
 * tracker words (T-187). The refusal's code is `rule`: it is about this one command,
 * so the queue sets it aside and sends the rest. Version 2 batches only: a reply to a
 * version 1 batch carries none of this, so a tracker opened before reads it (T-127).
 */
export const tablePlayerProblems = [
  /**
   * A change of number to one someone on the team wears, where the season wants unique
   * numbers (S-37): `wornBy` says who. A player added with a number already worn is
   * taken, with a notice instead (S-44).
   */
  'jersey-taken',
  /** The change would leave a player with neither a number nor a name (S-34). */
  'needs-name-or-number',
  /** The name does not fit once tidied: each part at most 100 characters. */
  'name-not-readable',
  /** The new player's id is already someone's, in this league or another. */
  'player-id-taken',
  /** No such player on that side's team now: `playerId` names them. */
  'not-on-team',
  /** The player is on the league's own roster: their name and place are the admin's (S-45). */
  'on-team-roster',
  /** An admin has reviewed this player added at the table: theirs to change now (S-45). */
  'reviewed',
  /** A play of this game names the player, so they stay on its list and its box score. */
  'has-plays',
  /** The player has a box score line in another game, so they stay on the team. */
  'has-lines',
  /** The player has a line in this game's box score, entered by hand, so they stay. */
  'in-box-score',
  /** The game was ended earlier in the batch: nothing more is taken for it. */
  'game-over',
  /**
   * The change that would have added this player was refused, earlier in this batch or
   * in one before (`follows` is its command ID, `playerId` the player), so this command,
   * which names them, is too.
   */
  'player-not-added',
  /** The database turned this one change away for a reason it gave no name to. */
  'not-saved',
] as const;
export const TablePlayerProblem = z.enum(tablePlayerProblems);
export type TablePlayerProblem = z.infer<typeof TablePlayerProblem>;

/**
 * Who wears a number: the player on the tracker's rosters, the number, and their name
 * as the scorekeeper sees it on those rosters (empty for one known by number only). The
 * name is for the screen only: the device's queue keeps the player's id, never the name
 * (record 054), and the server's `message` never holds it.
 */
export const WornBy = z.strictObject({
  playerId: Id,
  jersey: Jersey.min(1),
  /** Cut by the server to fit, never splitting a character (`wornByNameMax`). */
  name: z.string().max(201),
});

/** The longest wearer's name a reply carries, in UTF-16 units as the schema counts. */
export const wornByNameMax = 201;
export type WornBy = z.infer<typeof WornBy>;

/**
 * Said with an accepted change of players: a player added with a number someone on the
 * team already wears (S-44). Taken all the same and marked for the admin's review; the
 * season's unique-numbers rule is applied when the admin confirms them.
 */
export const TableNotice = z.strictObject({ kind: z.literal('jersey-also-worn'), wornBy: WornBy });
export type TableNotice = z.infer<typeof TableNotice>;

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
  z.strictObject({
    commandId: Id,
    status: z.literal('accepted'),
    /** A change of players only (version 2): something the scorekeeper should know. */
    notice: TableNotice.optional(),
  }),
  z.strictObject({ commandId: Id, status: z.literal('duplicate') }),
  z.strictObject({
    commandId: Id,
    status: z.literal('refused'),
    reason: z.strictObject({
      code: RefusalCode,
      message: z.string().max(300),
      /** Version 2 only: why, for the tracker to word. */
      problem: TablePlayerProblem.optional(),
      /** With `jersey-taken`: who wears the number. */
      wornBy: WornBy.optional(),
      /** With `not-on-team` and `player-not-added`: the player the command names. */
      playerId: Id.optional(),
      /** With `player-not-added`: the refused change that would have added them. */
      follows: Id.optional(),
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
  /** Up to 100 characters, as the database keeps them: 200 UTF-16 units at most. */
  firstName: z.string().max(200),
  lastName: z.string().max(200),
  jerseyNumber: Jersey.min(1).nullable(),
  left: z.boolean(),
  /** The game at whose scorer's table they were added (S-6), or null for the team's own roster. */
  addedAtGameId: Id.nullable(),
  /**
   * Added at a table and not yet reviewed by an admin: only such a player may be renamed
   * or taken off at the table (S-45).
   */
  toReview: z.boolean(),
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
  /** The game's season wants unique numbers on a team: a change to a number worn is refused (S-37). */
  uniqueJerseys: z.boolean(),
  /**
   * A level score may end the game: the rules it is played under allow ties (S-73, step
   * 2.37). The device refuses End game at a level score at once when they do not, with or
   * without a signal; the server stays the judge of the End tap.
   */
  allowTies: z.boolean(),
  players: z.array(TrackerRosterPlayer).max(1000),
});
export type TrackerRosters = z.infer<typeof TrackerRosters>;

// ---------------------------------------------------------------- the clock (T-121)
//
// What viewers receive is written once as plain shapes, and made into two schemas each:
// the strict one the server checks what it sends with, and a reading one (`…Reading`)
// a page reads with, which leaves out any field it does not know (record 058). So a
// field added after a page was opened never makes that page refuse a snapshot or a
// live message. Pages opened before the reading schemas existed still read strictly.

const runningShape = { state: z.literal('running'), remainingMs: Ms, asOf: Ms };
const stoppedShape = { state: z.literal('stopped'), remainingMs: Ms };

/**
 * The clock is sent as a reference, not every second: "running, this much left as of
 * this instant" or "stopped at this". `asOf` is server time in milliseconds; a viewer
 * counts down from it by itself.
 */
export const ClockReference = z.discriminatedUnion('state', [
  z.strictObject(runningShape),
  z.strictObject(stoppedShape),
]);
export type ClockReference = z.infer<typeof ClockReference>;
const ClockReading = z.discriminatedUnion('state', [
  z.object(runningShape),
  z.object(stoppedShape),
]);

// ---------------------------------------------------------------- what viewers see (T-117, T-118)

export const gameStatuses = ['scheduled', 'live', 'final'] as const;
export const GameStatus = z.enum(gameStatuses);
export type GameStatus = z.infer<typeof GameStatus>;

const sidesShape = { home: Ms, away: Ms };

const latestPlayShape = {
  type: z.enum(['score', 'foul', 'turnover', 'timeout', 'sub', 'period', 'other']),
  side: Side.optional(),
  playerName: z.string().max(120).nullable(),
  jersey: Jersey.min(1).nullable(),
  points: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
};

/**
 * The latest play, as facts. Names and numbers are only those the league and the team
 * allow to be shown (T-120); the page words it from its message file (T-187).
 *
 * The server must redact this to the most restrictive setting among everything that
 * receives it (S-22, T-87): one channel carries it to every viewer, so if either team
 * or the league hides names, numbers or points, it carries null here.
 */
export const LatestPlay = z.strictObject(latestPlayShape);
export type LatestPlay = z.infer<typeof LatestPlay>;

const liveMessageShape = {
  gameId: Id,
  /** Counts up by one per saved command; a viewer that sees a jump has missed one. */
  sequence: Ms,
  /** Server time when it was sent, in milliseconds: lets a device line its clock up. */
  sentAt: Ms,
  status: GameStatus,
  period: z.number().int().min(1).max(20),
};

/** The small numbered message published on a game's channel after each saved command. */
export const LiveMessage = z.strictObject({
  ...liveMessageShape,
  score: z.strictObject(sidesShape),
  clock: ClockReference,
  teamFouls: z.strictObject(sidesShape),
  latestPlay: LatestPlay.nullable(),
});
export type LiveMessage = z.infer<typeof LiveMessage>;

/** A live message as a page reads it: any field it does not know is left out. */
export const LiveMessageReading = z.object({
  ...liveMessageShape,
  score: z.object(sidesShape),
  clock: ClockReading,
  teamFouls: z.object(sidesShape),
  latestPlay: z.object(latestPlayShape).nullable(),
});

const snapshotPlayerShape = {
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
};

const teamShape = { name: z.string().max(120), statsVisible: z.boolean() };

const snapshotShape = {
  periods: z.union([z.literal(2), z.literal(4)]),
  /** Set when the game was reopened and finalised again; the date only (S-7). */
  correctedOn: z.iso.date().optional(),
};

/**
 * The game as it stands at one sequence number, for a page that is arriving, has found
 * a gap, or cannot hold a live connection (T-118, T-119). It carries everything a live
 * message does, so one rule can adopt either.
 */
export const GameSnapshot = LiveMessage.extend({
  ...snapshotShape,
  teams: z.strictObject({
    /** `statsVisible` false: this team's players carry null points and fouls (S-22, T-87). */
    home: z.strictObject(teamShape),
    away: z.strictObject(teamShape),
  }),
  /** As of this snapshot's sequence only; later messages do not update players. */
  players: z.array(z.strictObject(snapshotPlayerShape)).max(200),
});
export type GameSnapshot = z.infer<typeof GameSnapshot>;

/** A snapshot as a page reads it: any field it does not know is left out. */
export const GameSnapshotReading = LiveMessageReading.extend({
  ...snapshotShape,
  teams: z.object({ home: z.object(teamShape), away: z.object(teamShape) }),
  players: z.array(z.object(snapshotPlayerShape)).max(200),
});
