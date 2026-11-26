// How the scoring screens name players (R-33, T4 §7, step 2.226): the scorer's rosters
// (which the scorekeeper's device stores), the score page and the box score sheet. Each
// player shows by number and by the name the public sees, through the one name function
// (showName, T-81); a person's own "initials" or "removed" always holds here (R-25). The
// league's setting "Scorekeepers see full names" (off to start) shows everyone else in
// full. Two players who would read the same are told apart by their numbers; a player
// the number and name still do not tell apart (no number and no name to show, or the same
// as another on the team) gets a place, "Player 1", "Player 2" in roster order, so no one
// is impossible to pick. Nothing else of the recorded name leaves here.
import type { Audience } from '../leagues/index.ts';
import {
  publicViewer,
  showName,
  type NamePolicy,
  type NameRequest,
  type WhereShown,
} from '../people/index.ts';
import type { GameRosterPlayer, RecordedRosterPlayer } from './ports.ts';

/** What the rule needs to know of the league: its audience, its policy and the setting. */
export interface ScoringNameView {
  readonly audience: Audience;
  readonly policy: NamePolicy;
  /** R-33: "Scorekeepers see full names", off to start (readScoringNameView). */
  readonly scorekeepersSeeFullNames: boolean;
}

/** What the names follow apart from the audience, which scoringNameSettingsOf adds (readScoringNameView). */
export type ScoringNameSettings = Omit<ScoringNameView, 'audience'>;

/** One player of a team's roster as recorded. Nothing given here leaves the rule raw. */
export interface PlayerForScoring {
  readonly teamId: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Whether they count as a child (R-28), or null where the league does not know. */
  readonly isMinor: boolean | null;
  /** The person's own request (`people.visibility`); a value not known counts as removed. */
  readonly nameRequest: NameRequest | string;
  readonly jerseyNumber: string | null;
}

/**
 * The name a scoring screen shows. In full, the recorded first and last name (tidied); a
 * shorter form (first name and last initial, initials), whole in `firstName` with
 * `lastName` empty; no name to show, both empty (the number alone, S-34 "#12").
 * `ordinal` is the player's place among those of the team the number and name do not
 * tell apart, from 1 in roster order, or null: the screen words it ("Player 1").
 */
export interface ScoringName {
  readonly firstName: string;
  readonly lastName: string;
  readonly ordinal: number | null;
}

const tidy = (part: string): string => part.trim().replace(/\s+/g, ' ');

/**
 * No statistics stand beside a name on these screens (statsOf is null), so the one name
 * function never asks who views it; the viewer given is the least one.
 */
const nobody = publicViewer('');

function nameOf(player: PlayerForScoring, view: ScoringNameView): Omit<ScoringName, 'ordinal'> {
  const first = tidy(player.firstName);
  const last = tidy(player.lastName);
  // The setting shows names as a league on full names with children's confirmed would:
  // everyone in full, but the one name function still honours each person's own request,
  // so "initials" stays initials and "removed" (or a request not known) shows no name.
  const policy: NamePolicy = view.scorekeepersSeeFullNames
    ? { ...view.policy, names: 'full_name', childrenInFull: true }
    : view.policy;
  const where: WhereShown = {
    audience: view.audience,
    policy,
    viewer: nobody,
    statsOf: null,
  };
  const shown = showName(
    {
      firstName: player.firstName,
      lastName: player.lastName,
      isMinor: player.isMinor,
      nameRequest: player.nameRequest as NameRequest,
    },
    where,
  );
  if (!shown.shown) return { firstName: '', lastName: '' };
  // The public sees the name in full: keep its two parts, as the screens word them.
  if (shown.text === [first, last].filter(Boolean).join(' ')) {
    return { firstName: first, lastName: last };
  }
  return { firstName: shown.text, lastName: '' };
}

const numberOf = (jersey: string | null): string => (jersey === null ? '' : jersey.trim());

/** The names of a game's players in the order given (roster order within each team). */
export function scoringNames(
  players: readonly PlayerForScoring[],
  view: ScoringNameView,
): ScoringName[] {
  const named = players.map((player) => ({ player, ...nameOf(player, view) }));
  const readAs = (entry: (typeof named)[number]): string =>
    JSON.stringify([
      entry.player.teamId,
      numberOf(entry.player.jerseyNumber),
      entry.firstName,
      entry.lastName,
    ]);
  const count = new Map<string, number>();
  for (const entry of named) count.set(readAs(entry), (count.get(readAs(entry)) ?? 0) + 1);
  const places = new Map<string, number>();
  return named.map((entry) => {
    const empty =
      numberOf(entry.player.jerseyNumber) === '' && entry.firstName === '' && entry.lastName === '';
    const shared = (count.get(readAs(entry)) ?? 0) > 1;
    if (!empty && !shared)
      return { firstName: entry.firstName, lastName: entry.lastName, ordinal: null };
    const place = (places.get(entry.player.teamId) ?? 0) + 1;
    places.set(entry.player.teamId, place);
    return { firstName: entry.firstName, lastName: entry.lastName, ordinal: place };
  });
}

/** The game's roster named by the rule, in the order given; nothing else of the record. */
export function namedRoster(
  players: readonly RecordedRosterPlayer[],
  view: ScoringNameView,
): GameRosterPlayer[] {
  const names = scoringNames(
    players.map((p) => ({
      teamId: p.teamId,
      firstName: p.firstName,
      lastName: p.lastName,
      isMinor: p.isMinor ?? null,
      nameRequest: p.nameRequest ?? 'none',
      jerseyNumber: p.jerseyNumber,
    })),
    view,
  );
  return players.map(({ isMinor: _minor, nameRequest: _request, ...player }, i) => ({
    ...player,
    firstName: names[i]?.firstName ?? '',
    lastName: names[i]?.lastName ?? '',
    ordinal: names[i]?.ordinal ?? null,
  }));
}
