// THE SCHEDULE, VENUES AND IMPORTS OF THE ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY.
//
// The scheduling and imports modules' stores over one league's world
// (stand-in-world-state.ts), as packages/database's scheduling and imports stores read
// and write the same tables. A published game is a game of the season, the one the
// games area scores and the public pages show (insert-published-games.ts): its time is
// read in the league's own time zone and its court found by name at its venue. A
// fixture import writes into the same draft Admin → Schedule publishes.
import type {
  CourtRecord,
  GameFacts,
  ImportsStore,
  ScheduleGame,
  SchedulingStore,
  VenueRecord,
} from '@srleagues/core';
import { recordingOf } from '@srleagues/core';
import { randomUUID } from 'node:crypto';
import { dayIn, momentIn, timeIn } from './stand-in-world-clock.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';

const statuses = ['scheduled', 'live', 'final', 'postponed', 'cancelled', 'forfeit'] as const;
const scheduleStatusOf = (status: string): ScheduleGame['status'] =>
  statuses.find((s) => s === status) ?? 'scheduled';

const started = (status: string) => ['live', 'final', 'forfeit'].includes(status);

const byPlace = (a: CourtRecord, b: CourtRecord) => a.sort - b.sort || a.name.localeCompare(b.name);

export function worldSchedulingStore(s: LeagueWorld): SchedulingStore {
  const season = (seasonId: string) => s.seasons.find((x) => x.id === seasonId);
  const courtNamed = (venueId: string | null, name: string | null) =>
    venueId === null || name === null
      ? undefined
      : s.courts.find((c) => c.venueId === venueId && c.name === name && !c.binned);
  const hasEvents = (gameId: string) =>
    s.playsBefore.includes(gameId) || s.events.some((e) => e.gameId === gameId);
  const venueNameTaken = (name: string, except?: string) =>
    s.venues.some(
      (v) =>
        v.id !== except && !v.binned && v.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  const courtNameTaken = (venueId: string, name: string, except?: string) =>
    s.courts.some(
      (c) =>
        c.id !== except &&
        c.venueId === venueId &&
        !c.binned &&
        c.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  return {
    findSeason: async (seasonId) => {
      const found = season(seasonId);
      return found === undefined ? undefined : { programId: found.programId };
    },
    latestRevision: async (seasonId) => {
      const numbers = s.revisions.filter((r) => r.seasonId === seasonId).map((r) => r.number);
      return numbers.length === 0 ? null : Math.max(...numbers);
    },
    findDraft: async (seasonId) => s.drafts.find((d) => d.seasonId === seasonId),
    insertDraft: async (seasonId, changes, basedOnRevision) => {
      if (season(seasonId) === undefined) return 'no-season';
      if (s.drafts.some((d) => d.seasonId === seasonId)) return 'exists';
      const id = randomUUID();
      s.drafts.push({ id, seasonId, changes, basedOnRevision, version: 1 });
      return { id, version: 1 };
    },
    updateDraft: async (seasonId, draftId, changes, version) => {
      const at = s.drafts.findIndex(
        (d) => d.seasonId === seasonId && d.id === draftId && d.version === version,
      );
      const found = s.drafts[at];
      if (found === undefined) return undefined;
      s.drafts[at] = { ...found, changes, version: version + 1 };
      return version + 1;
    },
    deleteDraft: async (seasonId, draftId, version) => {
      const before = s.drafts.length;
      s.drafts = s.drafts.filter(
        (d) => !(d.seasonId === seasonId && d.id === draftId && d.version === version),
      );
      return s.drafts.length < before;
    },
    loadSchedule: async (seasonId) => ({
      rounds: s.rounds
        .filter((r) => r.seasonId === seasonId)
        .sort((a, b) => a.number - b.number)
        .map((r) => ({ id: r.id, label: r.label ?? `Round ${r.number}`, date: r.date })),
      games: s.games
        .filter((g) => g.seasonId === seasonId && !g.binned && g.startsAt !== null)
        .sort(
          (a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id.localeCompare(b.id),
        )
        .map((g) => {
          const at = new Date(g.startsAt ?? '');
          return {
            id: g.id,
            roundId: g.roundId,
            date: dayIn(at, s.timeZone),
            time: timeIn(at, s.timeZone),
            venueId: g.venueId,
            court: s.courts.find((c) => c.id === g.courtId)?.name ?? null,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            status: scheduleStatusOf(g.status),
            recording: recordingOf(g.captureMode) ?? null,
          };
        }),
    }),
    seasonRules: async (seasonId) => season(seasonId)?.rules,
    gamesById: async (seasonId, ids): Promise<readonly GameFacts[]> =>
      s.games
        .filter((g) => g.seasonId === seasonId && ids.includes(g.id))
        .map((g) => ({ id: g.id, status: g.status, binned: g.binned, hasEvents: hasEvents(g.id) })),
    countPeopleOnTeams: async (_seasonId, teamIds) =>
      new Set(
        s.roster
          .filter((r) => teamIds.includes(r.teamId) && r.leftOn === null)
          .map((r) => r.personId),
      ).size,
    insertPublishedGames: async (seasonId, games) => {
      for (const g of games) {
        const home = s.teams.find((t) => t.id === g.homeTeamId && t.seasonId === seasonId);
        const away = s.teams.find((t) => t.id === g.awayTeamId && t.seasonId === seasonId);
        if (home === undefined || away === undefined) {
          throw new Error('The database refuses a game for a team that is not of the season.');
        }
        s.games.push({
          id: g.id,
          seasonId,
          divisionId: home.divisionId === away.divisionId ? home.divisionId : null,
          homeTeamId: g.homeTeamId,
          awayTeamId: g.awayTeamId,
          startsAt: momentIn(g.date, g.time, s.timeZone),
          status: 'scheduled',
          captureMode: g.captureMode,
          homeScore: null,
          awayScore: null,
          format: null,
          finalizedAt: null,
          binned: false,
          version: 1,
          roundId: g.roundId,
          number: null,
          localDate: g.date,
          localTime: g.time,
          venueId: g.venueId,
          courtId: courtNamed(g.venueId, g.court)?.id ?? null,
        });
      }
    },
    updatePublishedGame: async (seasonId, gameId, change) => {
      const at = s.games.findIndex((g) => g.id === gameId && g.seasonId === seasonId);
      const game = s.games[at];
      if (game === undefined || game.binned || started(game.status)) return false;
      const slot = change.slot;
      s.games[at] = {
        ...game,
        ...(slot === undefined
          ? {}
          : {
              roundId: slot.roundId,
              localDate: slot.date,
              localTime: slot.time,
              startsAt: momentIn(slot.date, slot.time, s.timeZone),
              venueId: slot.venueId,
              courtId: courtNamed(slot.venueId, slot.court)?.id ?? null,
            }),
        ...(change.captureMode === undefined ? {} : { captureMode: change.captureMode }),
        version: game.version + 1,
      };
      return true;
    },
    binPublishedGames: async (seasonId, ids) => {
      let gone = 0;
      s.games = s.games.map((g) => {
        if (g.seasonId !== seasonId || !ids.includes(g.id) || g.binned) return g;
        if (hasEvents(g.id) || g.status === 'final' || g.status === 'forfeit') return g;
        gone += 1;
        return { ...g, binned: true };
      });
      return gone;
    },
    updateRound: async (seasonId, roundId, change) => {
      const at = s.rounds.findIndex((r) => r.id === roundId && r.seasonId === seasonId);
      const round = s.rounds[at];
      if (round === undefined) return false;
      s.rounds[at] = {
        ...round,
        ...(change.label === undefined ? {} : { label: change.label }),
        ...(change.date === undefined ? {} : { date: change.date }),
      };
      return true;
    },
    insertRevision: async (seasonId, revision) => {
      if (s.revisions.some((r) => r.seasonId === seasonId && r.number === revision.number)) {
        return false;
      }
      s.revisions.push({ seasonId, number: revision.number });
      return true;
    },
    teamsOfSeason: async (seasonId, teamIds) =>
      teamIds.filter((id) =>
        s.teams.some((t) => t.id === id && t.seasonId === seasonId && !t.binned),
      ),
    findVenue: async (venueId) => s.venues.find((v) => v.id === venueId),
    listVenues: async () =>
      s.venues
        .filter((v) => !v.binned)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((v) => ({
          ...v,
          courts: s.courts.filter((c) => c.venueId === v.id && !c.binned).sort(byPlace),
        })),
    createVenue: async (venue) => {
      if (venueNameTaken(venue.name)) return 'name-taken';
      const id = randomUUID();
      s.venues.push({ id, ...venue, binned: false, version: 1 });
      return id;
    },
    updateVenue: async (venueId, change, version) => {
      const at = s.venues.findIndex((v) => v.id === venueId);
      const found = s.venues[at];
      if (found === undefined || found.binned || found.version !== version) return undefined;
      if (change.name !== undefined && venueNameTaken(change.name, venueId)) return 'name-taken';
      const next: VenueRecord = { ...found, ...change, version: found.version + 1 };
      s.venues[at] = next;
      return next.version;
    },
    setVenueBinned: async (venueId, binned) => {
      const at = s.venues.findIndex((v) => v.id === venueId);
      const found = s.venues[at];
      if (found === undefined) return false;
      if (!binned && venueNameTaken(found.name, venueId)) return 'name-taken';
      s.venues[at] = { ...found, binned, version: found.version + 1 };
      return true;
    },
    hasLiveCourts: async (venueId) => s.courts.some((c) => c.venueId === venueId && !c.binned),
    listCourts: async (venueId) =>
      s.courts.filter((c) => c.venueId === venueId && !c.binned).sort(byPlace),
    findCourt: async (courtId) => s.courts.find((c) => c.id === courtId),
    createCourt: async (court) => {
      if (courtNameTaken(court.venueId, court.name)) return 'name-taken';
      const id = randomUUID();
      s.courts.push({ id, ...court, binned: false, version: 1 });
      return id;
    },
    updateCourt: async (courtId, change, version) => {
      const at = s.courts.findIndex((c) => c.id === courtId);
      const found = s.courts[at];
      if (found === undefined || found.binned) return undefined;
      if (version !== undefined && found.version !== version) return undefined;
      if (change.name !== undefined && courtNameTaken(found.venueId, change.name, courtId)) {
        return 'name-taken';
      }
      const next: CourtRecord = { ...found, ...change, version: found.version + 1 };
      s.courts[at] = next;
      return next.version;
    },
    setCourtBinned: async (courtId, binned) => {
      const at = s.courts.findIndex((c) => c.id === courtId);
      const found = s.courts[at];
      if (found === undefined) return false;
      if (!binned && courtNameTaken(found.venueId, found.name, courtId)) return 'name-taken';
      s.courts[at] = { ...found, binned, version: found.version + 1 };
      return true;
    },
  };
}

export function worldImportsStore(s: LeagueWorld, now: () => Date): ImportsStore {
  const season = (seasonId: string) => s.seasons.find((x) => x.id === seasonId);
  return {
    findSeason: async (seasonId) => {
      const found = season(seasonId);
      return found === undefined ? undefined : { programId: found.programId };
    },
    seasonNames: async (seasonId) => ({
      teams: s.teams
        .filter((t) => t.seasonId === seasonId && !t.binned)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((t) => ({ id: t.id, name: t.name })),
      venues: s.venues
        .filter((v) => !v.binned)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((v) => ({
          id: v.id,
          name: v.name,
          courts: s.courts
            .filter((c) => c.venueId === v.id && !c.binned)
            .sort(byPlace)
            .map((c) => c.name),
        })),
    }),
    insert: async (value) => {
      if (season(value.seasonId) === undefined) return 'no-season';
      const id = randomUUID();
      s.imports.push({
        id,
        seasonId: value.seasonId,
        kind: 'fixtures',
        status: 'reading',
        accountId: value.accountId,
        fileName: value.fileName,
        report: value.report,
        created: { version: 1 },
        appliedAt: null,
        undoneAt: null,
        version: 1,
      });
      return { id, version: 1 };
    },
    find: async (importId) => s.imports.find((x) => x.id === importId),
    save: async (importId, change, version) => {
      const at = s.imports.findIndex((x) => x.id === importId);
      const found = s.imports[at];
      if (found === undefined || found.version !== version) return undefined;
      const stamp = now().toISOString();
      s.imports[at] = {
        ...found,
        status: change.status,
        report: change.report ?? found.report,
        created: change.created ?? found.created,
        appliedAt: change.status === 'applied' ? (found.appliedAt ?? stamp) : found.appliedAt,
        undoneAt: change.status === 'undone' ? stamp : found.undoneAt,
        version: version + 1,
      };
      return version + 1;
    },
  };
}
