// What a game card's link says to a screen reader (docs/build/DESIGN.md, section 4, line
// 11): every card is one link to its game's page, in every state, and its hidden words say
// what that game is: "Herons against Falcons, live, 38 to 41". The words come from the
// message file (T-187): the server reads them once, braces and all, and hands them to the
// page, so a card whose score moves on the device says its new score. Nothing here reads
// the message file or the network.
import type { GameStatus } from '@srleagues/ui';

/** The message-file texts, with their {braces} still in. */
export type GameLinkWords = {
  /** A game with a score: {away} {home} {state} {awayScore} {homeScore}. */
  readonly score: string;
  /** A game with a state and no score: {away} {home} {state}. */
  readonly state: string;
  /** A game still to play: {away} {home} {when}. */
  readonly when: string;
  /** A game whose start has passed with no result yet: {away} {home} {when}. */
  readonly awaiting?: string;
  /** Each state as it is said inside those sentences: "live", "final", "postponed". */
  readonly states: Readonly<Record<Exclude<GameStatus, 'scheduled'>, string>>;
};

type LinkedGame = {
  readonly home: { readonly name: string; readonly score: number | null };
  readonly away: { readonly name: string; readonly score: number | null };
  readonly status: GameStatus;
  /** When it is played, as its card writes it. */
  readonly whenText: string;
  /** Its start has passed with no result yet (build-schedule.ts). */
  readonly awaiting?: boolean | undefined;
};

/**
 * Puts each {name} of a message's text in, in one pass: a value put in is never read again,
 * as braces or as a replacement pattern ($&).
 */
export const fill = (text: string, values: Readonly<Record<string, string | number>>): string =>
  text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );

/** The words of one game's link, away team first as on its card. */
export function gameLinkText(game: LinkedGame, words: GameLinkWords): string {
  const teams = { away: game.away.name, home: game.home.name };
  if (game.status === 'scheduled') {
    const sentence =
      game.awaiting === true && words.awaiting !== undefined ? words.awaiting : words.when;
    return fill(sentence, { ...teams, when: game.whenText });
  }
  const state = words.states[game.status];
  const played = game.status === 'live' || game.status === 'final' || game.status === 'forfeit';
  return played && game.home.score !== null && game.away.score !== null
    ? fill(words.score, {
        ...teams,
        state,
        awayScore: game.away.score,
        homeScore: game.home.score,
      })
    : fill(words.state, { ...teams, state });
}
