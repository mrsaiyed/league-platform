// What the games module announces (T-24). Standings and the like react without this
// module knowing they exist. A leaf file that imports nothing, so the games, leagues
// and standings modules can all read it while they load, whatever order they load in.

export const gameFinalized = 'games.finalized';
export const gameReopened = 'games.reopened';

/** A game was decided: a final score or a forfeit. */
export type GameFinalized = {
  readonly type: typeof gameFinalized;
  readonly leagueId: string;
  readonly gameId: string;
  readonly seasonId: string;
};

/** A decided game was reopened, with a correction on record. */
export type GameReopened = {
  readonly type: typeof gameReopened;
  readonly leagueId: string;
  readonly gameId: string;
  readonly seasonId: string;
};
