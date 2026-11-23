// What the bin screen shows of each thing (step 2.77, A-5): every kind the store keeps in
// the bin, each with what the person bringing it back needs to know first, and what tells
// two of one name apart. A team says its season and division, how many games it played
// and has still to play, which come back with it (A-17), and who on its roster is in the
// bin too (A-16); a game says its season, when it was to be played, that it comes back
// with no round when it has none (S-60), and which of its teams is in the bin, so it
// cannot come back before them; a division says its season, a court its venue. The words
// come from the message files (T-187).
import type { BinKind, BinListing } from '@srleagues/core';
import { gameWhenText, leagueDayText, type LeagueTimes } from '../../server/game-when.ts';
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
  const teamIds = new Set(items.filter((i) => i.kind === 'team').map((i) => i.id));
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
      // Names only to whoever sees the people's part (all of it, league-wide); else a count.
      const roster = details.rosterInBin ?? [];
      if (roster.length > 0 && roster.every((id) => personName.has(id))) {
        const names = roster
          .map((id) => personName.get(id) || t('admin.bin.person.unnamed'))
          .join(', ');
        facts.push(t('admin.bin.team.rosterInBin', { names }));
      } else if (roster.length === 1) {
        facts.push(t('admin.bin.team.rosterInBinOne'));
      } else if (roster.length > 1) {
        facts.push(t('admin.bin.team.rosterInBinCount', { count: roster.length }));
      }
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
    if (teamsInBin.length > 0) facts.push(teamsInBinWords(teamsInBin, teamIds, 'fact'));
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
 * What holds a game back: its team or two teams in the bin, and what to do. Whoever has
 * those teams in their own part of the bin (`mine`) brings them back first; anyone else
 * asks an admin.
 */
export function teamsInBinWords(
  teams: readonly { readonly id: string; readonly name: string }[],
  mine: ReadonlySet<string>,
  as: 'fact' | 'refusal',
): string {
  const ask = !teams.every((team) => mine.has(team.id));
  const [first, second] = teams;
  if (second !== undefined && first !== undefined) {
    const key =
      as === 'fact'
        ? ask
          ? 'admin.bin.game.teamsInBinAsk'
          : 'admin.bin.game.teamsInBin'
        : ask
          ? 'admin.bin.game.notBackTeamsAsk'
          : 'admin.bin.game.notBackTeams';
    return t(key, { first: first.name, second: second.name });
  }
  const names = teams.map((team) => team.name).join(', ');
  const key =
    as === 'fact'
      ? ask
        ? 'admin.bin.game.teamInBinAsk'
        : 'admin.bin.game.teamInBin'
      : ask
        ? 'admin.bin.game.notBackTeamAsk'
        : 'admin.bin.game.notBackTeam';
  return t(key, { names });
}

/**
 * The other team of the same season that now has a team-in-the-bin's name (S-83), or its
 * short name (`short`), for the refusal to say which one and lead to it: the same name
 * whatever its capitals and spaces; the same short name as the binned team's own record
 * when the list holds it, else the same name.
 */
export function nameTakenBy<
  T extends { readonly id: string; readonly name: string; readonly slug: string },
>(
  binned: { readonly id: string; readonly name: string },
  teams: readonly T[],
  short = false,
): T | undefined {
  const others = teams.filter((team) => team.id !== binned.id);
  if (short) {
    // The list may leave out teams in the bin: then the one that took its short name is
    // the one that took its name too (A-19: a second team of the same name).
    const slug = teams.find((team) => team.id === binned.id)?.slug;
    if (slug !== undefined) return others.find((team) => team.slug === slug);
  }
  const same = (a: string) => a.trim().toLowerCase() === binned.name.trim().toLowerCase();
  return others.find((team) => same(team.name));
}

/** What a game back from the bin was (A-19), as the server keeps it for the next page. */
export type GameBack = {
  readonly revision: number;
  readonly teams: number;
  readonly people: number;
};

export const gameBackSaid = (back: GameBack): string =>
  `${back.revision}.${back.teams}.${back.people}`;

export function gameBackOf(said: string): GameBack | undefined {
  const found = /^([0-9]{1,9})\.([0-9]{1,9})\.([0-9]{1,9})$/.exec(said);
  if (found === null) return undefined;
  return { revision: Number(found[1]), teams: Number(found[2]), people: Number(found[3]) };
}

/** A game now at a restored game's time (A-19): "Hawks at Owls, Sat, Dec 5, 19:00, court 2". */
export function clashWords(
  game: {
    readonly homeTeamId: string;
    readonly awayTeamId: string;
    readonly date: string;
    readonly time: string | null;
    readonly court: string | null;
  },
  teamNames: Readonly<Record<string, string>>,
  locale: string,
): string {
  const when = [leagueDayText(game.date, locale), game.time ?? '']
    .filter((w) => w !== '')
    .join(', ');
  const words = {
    home: teamNames[game.homeTeamId] ?? '',
    away: teamNames[game.awayTeamId] ?? '',
    when,
  };
  return game.court === null || game.court === ''
    ? t('admin.bin.gameBackClash', words)
    : t('admin.bin.gameBackClashCourt', { ...words, court: game.court });
}
