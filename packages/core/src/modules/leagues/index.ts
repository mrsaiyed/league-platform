// The leagues module (T2 §3). Other modules and packages use only what is here.
export {
  setLeagueName,
  type ChangedSinceRead,
  type LeagueName,
} from './commands/set-league-name.ts';
export { leagueNameChanged, type LeagueNameChanged } from './events.ts';
export type { LeagueRecord, LeaguesStore, LeaguesTx } from './ports.ts';
