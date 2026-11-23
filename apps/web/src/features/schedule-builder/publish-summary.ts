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

/** One line for each game publishing adds, moves or removes, in the order core gives. */
export function publishLines(
  changes: readonly PublishGameChange[],
  teams: readonly GridTeam[],
): PublishLine[] {
  const name = nameIn(teams);
  return changes.map((c) => {
    const game = t('schedule.admin.gameVs', { away: name(c.awayTeamId), home: name(c.homeTeamId) });
    const text =
      c.kind === 'added' && c.after !== null
        ? t('schedule.admin.publishGame.added', { game, when: whenText(c.after) })
        : c.kind === 'removed' && c.before !== null
          ? t('schedule.admin.publishGame.removed', { game, when: whenText(c.before) })
          : c.before !== null && c.after !== null
            ? t('schedule.admin.publishGame.moved', {
                game,
                from: whenText(c.before),
                to: whenText(c.after),
              })
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
