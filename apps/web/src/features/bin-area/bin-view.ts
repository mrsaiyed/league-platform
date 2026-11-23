// What the bin screen shows of each thing (step 2.77, A-5): teams, people and games, each
// with what the person bringing it back needs to know first. A team says how many games
// it played and has still to play, which come back with it (A-17), and who on its roster
// is in the bin too (A-16); a game says when it is and that it comes back with no round
// when it has none (S-60). Divisions, venues and courts are put back from their own
// screens and are not listed here. The words come from the message files (T-187).
import type { BinListing } from '@srleagues/core';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import { t } from '../../server/messages.ts';

export type BinKindShown = 'team' | 'person' | 'game';

export type BinRow = {
  readonly kind: BinKindShown;
  readonly id: string;
  /** Its name; a game's two teams. */
  readonly title: string;
  /** What is told before it is brought back, one sentence each. */
  readonly facts: readonly string[];
};

export type BinView = {
  readonly teams: readonly BinRow[];
  readonly people: readonly BinRow[];
  readonly games: readonly BinRow[];
};

const shown = (kind: string): kind is BinKindShown =>
  kind === 'team' || kind === 'person' || kind === 'game';

export function binView(items: readonly BinListing[], times: LeagueTimes): BinView {
  const personName = new Map(
    items.filter((i) => i.kind === 'person').map((i) => [i.id, i.name] as const),
  );
  const rows = items.flatMap((item): BinRow[] => {
    if (!shown(item.kind)) return [];
    const details = item.details ?? {};
    if (item.kind === 'team') {
      const facts = [
        t('admin.bin.team.games', {
          played: details.gamesPlayed ?? 0,
          toCome: details.gamesToCome ?? 0,
        }),
      ];
      const names = (details.rosterInBin ?? [])
        .map((id) => personName.get(id) || t('admin.bin.person.unnamed'))
        .join(', ');
      if (names !== '') facts.push(t('admin.bin.team.rosterInBin', { names }));
      return [{ kind: 'team', id: item.id, title: item.name, facts }];
    }
    if (item.kind === 'person') {
      const title = item.name === '' ? t('admin.bin.person.unnamed') : item.name;
      return [{ kind: 'person', id: item.id, title, facts: [] }];
    }
    const facts = [gameWhenText(details.startsAt ?? null, times)];
    if (details.withoutRound === true) facts.push(t('admin.bin.game.noRound'));
    const title = t('admin.bin.game.name', { home: item.name, away: item.secondName ?? '' });
    return [{ kind: 'game', id: item.id, title, facts }];
  });
  return {
    teams: rows.filter((r) => r.kind === 'team'),
    people: rows.filter((r) => r.kind === 'person'),
    games: rows.filter((r) => r.kind === 'game'),
  };
}
