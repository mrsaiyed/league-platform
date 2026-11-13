// Where live messages travel (T6 §6; T-117, T-120): one channel per game and one
// lighter channel per league with only the scores of its live games, for the
// "Live now" markers. The server and the browser name channels with these helpers,
// whichever service carries them, so the two always agree.
//
// Every channel name starts with the league, so a channel is always inside its
// league's fence, as every query is (T4).
import { z } from 'zod';
import { GameStatus, LiveMessage } from './tracker-protocol.ts';

const Id = z.uuid();
const Ms = z.number().int().nonnegative();

/** The one event name on every live channel. */
export const liveEventName = 'update';

export type LiveChannel =
  | { readonly kind: 'game'; readonly leagueId: string; readonly gameId: string }
  | { readonly kind: 'league-scores'; readonly leagueId: string };

const isId = (value: string): boolean => Id.safeParse(value).success;

function checkedId(value: string, what: string): string {
  if (!isId(value)) throw new Error(`${what} must be a UUID.`);
  return value.toLowerCase();
}

/** The channel a game's live messages (`LiveMessage`) travel on. */
export const gameChannelName = (leagueId: string, gameId: string): string =>
  `league:${checkedId(leagueId, 'leagueId')}:game:${checkedId(gameId, 'gameId')}`;

/** The channel a league's live scores (`LeagueScoreMessage`) travel on. */
export const leagueScoresChannelName = (leagueId: string): string =>
  `league:${checkedId(leagueId, 'leagueId')}:live-scores`;

export const liveChannelName = (channel: LiveChannel): string =>
  channel.kind === 'game'
    ? gameChannelName(channel.leagueId, channel.gameId)
    : leagueScoresChannelName(channel.leagueId);

/** Reads a channel name back, or null if it is not one of ours. */
export function parseLiveChannelName(name: string): LiveChannel | null {
  const parts = name.split(':');
  if (parts[0] !== 'league' || parts[1] === undefined || !isId(parts[1])) return null;
  const leagueId = parts[1];
  if (parts.length === 3 && parts[2] === 'live-scores') {
    return name === leagueScoresChannelName(leagueId) ? { kind: 'league-scores', leagueId } : null;
  }
  if (parts.length === 4 && parts[2] === 'game' && parts[3] !== undefined && isId(parts[3])) {
    const gameId = parts[3];
    return name === gameChannelName(leagueId, gameId) ? { kind: 'game', leagueId, gameId } : null;
  }
  return null;
}

/**
 * What the league's channel carries for one game: its score and where it stands,
 * nothing about players. `sequence` is the game's own, so a page keeps the newest.
 */
export const LeagueScoreMessage = z.strictObject({
  gameId: Id,
  sequence: Ms,
  sentAt: Ms,
  status: GameStatus,
  score: z.strictObject({ home: Ms, away: Ms }),
  period: z.number().int().min(1).max(20),
});
export type LeagueScoreMessage = z.infer<typeof LeagueScoreMessage>;

/** The league channel's message for a game, taken from that game's live message. */
export const leagueScoreFrom = (message: LiveMessage): LeagueScoreMessage => ({
  gameId: message.gameId,
  sequence: message.sequence,
  sentAt: message.sentAt,
  status: message.status,
  score: { home: message.score.home, away: message.score.away },
  period: message.period,
});
