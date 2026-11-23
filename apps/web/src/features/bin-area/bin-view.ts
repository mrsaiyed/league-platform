// What the bin screen shows of each thing (step 2.77, A-5): every kind the store keeps in
// the bin, each with what the person bringing it back needs to know first, and what tells
// two of one name apart. A team says its season and division, how many games it played
// and has still to play, which come back with it (A-17), and who on its roster is in the
// bin too (A-16); a game says its season, when it was to be played, that it comes back
// with no round when it has none (S-60), and which of its teams is in the bin, so it
// cannot come back before them; a division says its season, a court its venue. The words
// come from the message files (T-187).
import type { BinKind, BinListing } from '@srleagues/core';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import { t } from '../../server/messages.ts';

export type BinKindShown = BinKind;

export type BinRow = {
  readonly kind: BinKindShown;
  readonly id: string;
  /** Its name; a game's two teams. */
  readonly title: string;
  /** What is told before it is brought back, one sentence each. */
  readonly facts: readonly string[];
  /** A game: its teams in the bin, which must come back first. */
  readonly teamsInBin: readonly { readonly id: string; readonly name: string }[];
};

export type BinView = Readonly<Record<BinKindShown, readonly BinRow[]>>;

/** The order of the bin screen's parts. */
export const binKindsShown: readonly BinKindShown[] = [
  'team',
  'division',
  'person',
  'game',
  'venue',
  'court',
];

export function binView(items: readonly BinListing[], times: LeagueTimes): BinView {
  const personName = new Map(
    items.filter((i) => i.kind === 'person').map((i) => [i.id, i.name] as const),
  );
  const rows = items.map((item): BinRow => {
    const details = item.details ?? {};
    const season =
      details.seasonName === undefined
        ? []
        : [t('admin.bin.inSeason', { season: details.seasonName })];
    const row = { kind: item.kind, id: item.id, title: item.name, teamsInBin: [] };
    if (item.kind === 'team') {
      const facts = [...season];
      if (details.divisionName !== undefined && details.divisionName !== null) {
        facts.push(t('admin.bin.team.division', { division: details.divisionName }));
      }
      facts.push(
        t('admin.bin.team.games', {
          played: details.gamesPlayed ?? 0,
          toCome: details.gamesToCome ?? 0,
        }),
      );
      const names = (details.rosterInBin ?? [])
        .map((id) => personName.get(id) || t('admin.bin.person.unnamed'))
        .join(', ');
      if (names !== '') facts.push(t('admin.bin.team.rosterInBin', { names }));
      return { ...row, facts };
    }
    if (item.kind === 'person') {
      const title = item.name === '' ? t('admin.bin.person.unnamed') : item.name;
      return { ...row, title, facts: [] };
    }
    if (item.kind === 'division') return { ...row, facts: season };
    if (item.kind === 'venue') return { ...row, facts: [] };
    if (item.kind === 'court') {
      const venue = details.venueName ?? '';
      return { ...row, facts: venue === '' ? [] : [t('admin.bin.court.venue', { venue })] };
    }
    const facts = [...season, gameWhenText(details.startsAt ?? null, times)];
    if (details.withoutRound === true) facts.push(t('admin.bin.game.noRound'));
    const teamsInBin = details.teamsInBin ?? [];
    if (teamsInBin.length > 0) {
      facts.push(
        t('admin.bin.game.teamInBin', { names: teamsInBin.map((team) => team.name).join(', ') }),
      );
    }
    const title = t('admin.bin.game.name', { home: item.name, away: item.secondName ?? '' });
    return { ...row, title, facts, teamsInBin };
  });
  const of = (kind: BinKindShown) => rows.filter((r) => r.kind === kind);
  return {
    team: of('team'),
    division: of('division'),
    person: of('person'),
    game: of('game'),
    venue: of('venue'),
    court: of('court'),
  };
}

/**
 * The live team of the same season that now has a team-in-the-bin's name (S-83), for the
 * refusal to say which one and lead to it; the same name whatever its capitals and spaces.
 */
export function nameTakenBy<T extends { readonly id: string; readonly name: string }>(
  binned: { readonly id: string; readonly name: string },
  teams: readonly T[],
): T | undefined {
  const same = (a: string) => a.trim().toLowerCase() === binned.name.trim().toLowerCase();
  return teams.find((team) => team.id !== binned.id && same(team.name));
}
