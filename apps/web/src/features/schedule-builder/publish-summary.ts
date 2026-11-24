// The publish box's words (step 2.53, P7 §4.4, A-7): each game publishing adds, moves or
// removes, by name, with its old and new day and time; and the question it asks, which
// names each standing clash and each game outside its round (S-53, S-62). Neither is a
// blocker: the admin may mean a game to be where it is. No page code here, so it is tested
// on its own.
import type { Clash, PublishGameChange } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import { clockText, dayText, type GridGame, type GridTeam } from './build-grid.ts';

export type PublishLine = {
  readonly gameId: string;
  readonly kind: PublishGameChange['kind'];
  readonly text: string;
};

type Slot = { readonly date: string; readonly time: string | null };

const whenText = (slot: Slot): string =>
  slot.time === null
    ? t('schedule.admin.publishWhenNoTime', { date: dayText(slot.date) })
    : t('schedule.admin.publishWhen', { date: dayText(slot.date), time: clockText(slot.time) });

/** A team's name as the grid has it; a team not on the page is named plainly. */
const nameIn =
  (teams: readonly GridTeam[]) =>
  (id: string): string =>
    teams.find((x) => x.id === id)?.name ?? t('schedule.admin.publishUnknownTeam');

/** How the page names a place and a round, so a line can say what of a game's slot changed. */
export type PublishPlaces = {
  readonly placeOf: (venueId: string | null, court: string | null) => string | null;
  readonly roundOf: (roundId: string | null) => string | null;
};

const noPlaces: PublishPlaces = { placeOf: () => null, roundOf: () => null };

type FullSlot = NonNullable<PublishGameChange['after']>;

/**
 * What of a moved game's slot changed, in words: the time, the place, the round, each only
 * when it changed. Empty when the slot is the same (a postponed game back on its date).
 */
const movedParts = (before: FullSlot, after: FullSlot, places: PublishPlaces): string[] => {
  const parts: string[] = [];
  if (before.date !== after.date || before.time !== after.time) {
    parts.push(
      t('schedule.admin.publishGame.time', { from: whenText(before), to: whenText(after) }),
    );
  }
  if (before.venueId !== after.venueId || before.court !== after.court) {
    const named = (s: FullSlot) =>
      places.placeOf(s.venueId, s.court) ?? s.court ?? t('schedule.admin.noPlace');
    parts.push(t('schedule.admin.publishGame.place', { from: named(before), to: named(after) }));
  }
  if (before.roundId !== after.roundId) {
    parts.push(
      t('schedule.admin.publishGame.round', {
        round: places.roundOf(after.roundId) ?? t('schedule.admin.publishGame.noRound'),
      }),
    );
  }
  return parts;
};

/** One line for each game publishing adds, moves or removes, in the order core gives. */
export function publishLines(
  changes: readonly PublishGameChange[],
  teams: readonly GridTeam[],
  places: PublishPlaces = noPlaces,
): PublishLine[] {
  const name = nameIn(teams);
  const movedText = (game: string, before: FullSlot, after: FullSlot): string => {
    const parts = movedParts(before, after, places);
    return parts.length === 0
      ? t('schedule.admin.publishGame.backOnDate', { game, when: whenText(after) })
      : t('schedule.admin.publishGame.moved', { game, what: parts.join(', ') });
  };
  return changes.map((c) => {
    const game = t('schedule.admin.gameVs', { away: name(c.awayTeamId), home: name(c.homeTeamId) });
    const text =
      c.kind === 'added' && c.after !== null
        ? t('schedule.admin.publishGame.added', { game, when: whenText(c.after) })
        : c.kind === 'removed' && c.before !== null
          ? t('schedule.admin.publishGame.removed', { game, when: whenText(c.before) })
          : c.before !== null && c.after !== null
            ? movedText(game, c.before, c.after)
            : t('schedule.admin.publishGame.changed', { game });
    return { gameId: c.gameId, kind: c.kind, text };
  });
}

/**
 * The sentences the question asks before "Publish anyway?": each clash still in the draft,
 * then the games outside their round. Empty when there is nothing to warn of.
 */
export function publishWarnings(
  clashes: readonly Clash[],
  games: readonly GridGame[],
  teams: readonly GridTeam[],
): string[] {
  const name = nameIn(teams);
  const gameOf = (id: string) => games.find((g) => g.id === id);
  const gameText = (g: GridGame) =>
    t('schedule.admin.gameVs', { away: g.awayName, home: g.homeName });
  const said = clashes.map((c) => {
    switch (c.kind) {
      case 'team-in-two-places':
        return t('schedule.admin.ask.team', {
          team: name(c.teamId),
          date: dayText(c.date),
          time: clockText(c.time),
        });
      case 'court-booked-twice': {
        const first = c.gameIds.map(gameOf).find((g) => g !== undefined);
        return t('schedule.admin.ask.court', {
          place: first?.placeLabel ?? c.court,
          date: dayText(c.date),
          time: clockText(c.time),
        });
      }
      case 'skipped-date': {
        const g = gameOf(c.gameId);
        return t('schedule.admin.ask.skipped', {
          game: g === undefined ? t('schedule.admin.publishUnknownGame') : gameText(g),
          date: dayText(c.date),
        });
      }
    }
  });
  const outside = games.filter((g) => g.outsideRound);
  if (outside.length > 0) {
    said.push(
      t.plural('schedule.admin.ask.outside', outside.length, {
        games: outside
          .map((g) =>
            t('schedule.admin.ask.outsideGame', { game: gameText(g), date: dayText(g.date) }),
          )
          .join('; '),
      }),
    );
  }
  return said;
}
