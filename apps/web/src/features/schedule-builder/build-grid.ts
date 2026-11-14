// The schedule grid's rows, worked out from the draft the scheduling query returns
// (P7 §4.3): rounds with their games in order, games that belong to no round, which
// games are in a clash, and the clashes in words. No page code here, so it is tested
// without a server.
import type { Clash, ScheduleDraftView, ScheduleGame, VenueWithCourts } from '@srleagues/core';
import { t } from '../../server/messages.ts';

export type GridTeam = { readonly id: string; readonly name: string };

export type GridGame = {
  readonly id: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly roundId: string | null;
  readonly date: string;
  readonly time: string | null;
  /** The venue and court as one form value (see placeValue). */
  readonly place: string;
  readonly placeLabel: string | null;
  readonly recording: ScheduleGame['recording'];
  readonly status: ScheduleGame['status'];
  /** Only a game that is still just scheduled can be edited here. */
  readonly editable: boolean;
  readonly clashed: boolean;
};

export type GridRound = {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  readonly date: string | null;
  readonly games: readonly GridGame[];
};

export type GridClash = { readonly key: string; readonly text: string };

export type Grid = {
  readonly rounds: readonly GridRound[];
  /** Games that belong to no round. */
  readonly looseGames: readonly GridGame[];
  readonly clashes: readonly GridClash[];
  readonly allGames: readonly GridGame[];
};

/** A venue and court as one value for a form field: `venueId|court`, empty for none. */
export function placeValue(venueId: string | null, court: string | null): string {
  return venueId === null ? '' : `${venueId}|${court ?? ''}`;
}

/** The other way round; a value that is not one of ours is "no place". */
export function parsePlace(value: string): { venueId: string | null; court: string | null } {
  const cut = value.indexOf('|');
  if (cut < 1) return { venueId: null, court: null };
  const court = value.slice(cut + 1);
  return { venueId: value.slice(0, cut), court: court === '' ? null : court };
}

const byWhen = (a: GridGame, b: GridGame) =>
  a.date.localeCompare(b.date) ||
  (a.time ?? '99:99').localeCompare(b.time ?? '99:99') ||
  a.id.localeCompare(b.id);

const gamesOf = (c: Clash): readonly string[] =>
  c.kind === 'skipped-date' ? [c.gameId] : c.gameIds;

export function buildGrid(
  view: Pick<ScheduleDraftView, 'result' | 'clashes'>,
  teams: readonly GridTeam[],
  venues: readonly VenueWithCourts[],
): Grid {
  const teamName = (id: string) => teams.find((x) => x.id === id)?.name ?? id;
  const labelOf = (venueId: string | null, court: string | null): string | null => {
    if (venueId === null) return null;
    const venue = venues.find((v) => v.id === venueId);
    if (venue === undefined) return null;
    return court === null
      ? venue.name
      : t('schedule.admin.gameWhere', { venue: venue.name, court });
  };
  const clashed = new Set(view.clashes.flatMap(gamesOf));
  const all: GridGame[] = view.result.games
    .map((g) => ({
      id: g.id,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeName: teamName(g.homeTeamId),
      awayName: teamName(g.awayTeamId),
      roundId: g.roundId,
      date: g.date,
      time: g.time,
      place: placeValue(g.venueId, g.court),
      placeLabel: labelOf(g.venueId, g.court),
      recording: g.recording ?? null,
      status: g.status,
      editable: g.status === 'scheduled',
      clashed: clashed.has(g.id),
    }))
    .sort(byWhen);
  const roundIds = new Set(view.result.rounds.map((r) => r.id));
  const gameText = (id: string) => {
    const g = all.find((x) => x.id === id);
    return g === undefined
      ? id
      : t('schedule.admin.gameVs', { away: g.awayName, home: g.homeName });
  };
  const clashText = (c: Clash): string => {
    const games = gamesOf(c).map(gameText).join('; ');
    switch (c.kind) {
      case 'team-in-two-places':
        return t('schedule.admin.clash.team', {
          team: teamName(c.teamId),
          time: c.time,
          date: c.date,
          games,
        });
      case 'court-booked-twice':
        return t('schedule.admin.clash.court', {
          place: labelOf(c.venueId, c.court) ?? c.court,
          time: c.time,
          date: c.date,
          games,
        });
      case 'skipped-date':
        return t('schedule.admin.clash.skipped', { game: games, date: c.date });
    }
  };
  return {
    rounds: view.result.rounds.map((r, i) => ({
      id: r.id,
      number: i + 1,
      label: r.label,
      date: r.date,
      games: all.filter((g) => g.roundId === r.id),
    })),
    looseGames: all.filter((g) => g.roundId === null || !roundIds.has(g.roundId)),
    clashes: view.clashes.map((c, i) => ({ key: `${c.kind}-${i}`, text: clashText(c) })),
    allGames: all,
  };
}
