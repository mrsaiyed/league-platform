// The games list's score boxes as the forms send them (steps 2.154 and 2.155): a game id,
// two typed scores, and which box is wrong when they are refused. Nothing here is read
// from the address (T-271, record 067): the forms are answered in the response to the post.

/** A score as typed: a whole number from 0 to 999, as text. */
export type TypedScores = { readonly homeScore: string; readonly awayScore: string };

/** The two score boxes, in the order they are on the screen (away team first, as the card). */
export const scoreFields = ['awayScore', 'homeScore'] as const;
export type ScoreField = (typeof scoreFields)[number];

const gameIdShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scoreShape = /^\d{1,3}$/;

/** A game id as the forms send it, lower case; undefined when it is not one. */
export function gameIdOf(text: string | undefined): string | undefined {
  const trimmed = (text ?? '').trim();
  return gameIdShape.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

/** Two typed scores, each a whole number from 0 to 999; undefined when either is not. */
export function typedScoresOf(
  home: string | undefined,
  away: string | undefined,
): TypedScores | undefined {
  const [homeScore, awayScore] = [(home ?? '').trim(), (away ?? '').trim()];
  return scoreShape.test(homeScore) && scoreShape.test(awayScore)
    ? { homeScore: String(Number(homeScore)), awayScore: String(Number(awayScore)) }
    : undefined;
}

/** The score boxes that do not hold a whole number from 0 to 999, in screen order. */
export function wrongScoreFields(
  fields: Readonly<Record<string, string | undefined>>,
): readonly ScoreField[] {
  return scoreFields.filter((name) => !scoreShape.test((fields[name] ?? '').trim()));
}

/** The id a game's place on the list carries, so an answer can lead straight to it. */
export const gameAnchor = (gameId: string) => `game-${gameId}`;
