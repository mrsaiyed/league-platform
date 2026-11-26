// The engine's sentences in the tracker's own words (finding M3 of the 2.107 audit;
// T-187). The engine (packages/sports/src/basketball/live.ts, reused as it is: T-110)
// refuses with English sentences and describes plays in English. The screens never show
// those: this is the one table from each refusal and each kind of play to a message key,
// shared by the scoring screen (step 2.35), the clock (2.36) and the play log, Undo and
// the "not saved" lists (2.37). engine-words.test.ts reads the engine's source and fails
// when it has a refusal or a kind of play with no message here.
import type { MessageKey, Translate } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';

export type RefusalKey = Extract<MessageKey, `tracker.refusal.${string}`>;

/** The refusal no sentence of the table matches: a newer engine than these words. */
export const unknownRefusalKey = 'tracker.refusal.other' satisfies RefusalKey;

/** The engine's refusals that are always the same sentence. */
const refusals: Readonly<Record<string, RefusalKey>> = {
  'This game is final. Reopen it to make changes.': 'tracker.refusal.gameFinal',
  'The clock is already running.': 'tracker.refusal.clockRunning',
  'This period is over. Pick the next period first.': 'tracker.refusal.periodOver',
  'The clock is not running.': 'tracker.refusal.clockNotRunning',
  'Nothing to undo.': 'tracker.refusal.nothingToUndo',
  'Nothing to redo.': 'tracker.refusal.nothingToRedo',
  'The format is fixed once the game is under way. Mark it not started to change it.':
    'tracker.refusal.formatFixed',
  'Nothing is recorded for this game yet.': 'tracker.refusal.nothingRecorded',
  'Only a final game can be reopened.': 'tracker.refusal.notFinal',
  'Unknown action.': 'tracker.refusal.unknownAction',
  'Pick a period.': 'tracker.refusal.pickPeriod',
  'Pick a stop clock or a running clock.': 'tracker.refusal.pickClockMode',
  'The clock is already running through fouls.': 'tracker.refusal.alreadyRunningClock',
  'The clock already stops on fouls.': 'tracker.refusal.alreadyStopClock',
  'Unknown team.': 'tracker.refusal.unknownTeam',
  'Pick each player once.': 'tracker.refusal.lineupRepeats',
  'This team already has players on the floor. Use substitutions.':
    'tracker.refusal.lineupAlreadySet',
  'A basket is 1, 2 or 3 points.': 'tracker.refusal.badPoints',
  'Pick the basket to take back.': 'tracker.refusal.pickBasket',
  'That basket is not in this game.': 'tracker.refusal.basketNotInGame',
  'That play is not a basket.': 'tracker.refusal.notABasket',
  'That basket is already taken back.': 'tracker.refusal.basketAlreadyTakenBack',
  'That basket was not made by that player for those points.': 'tracker.refusal.basketNotTheirs',
  'Pick a player.': 'tracker.refusal.pickPlayer',
  'That player has no foul to take back.': 'tracker.refusal.noFoulToTakeBack',
  'That player has no turnover to take back.': 'tracker.refusal.noTurnoverToTakeBack',
  'There is no team turnover to take back.': 'tracker.refusal.noTeamTurnoverToTakeBack',
  'A timeout is 60 or 30 seconds.': 'tracker.refusal.badTimeout',
  'There is no timeout to take back.': 'tracker.refusal.noTimeoutToTakeBack',
  'Pick who comes on and who comes off.': 'tracker.refusal.subNeedsBoth',
  'The player coming off is not on the floor.': 'tracker.refusal.subOutNotOnCourt',
  'That player is already on the floor.': 'tracker.refusal.subInOnCourt',
  'Set the clock between 0:00 and 60:00.': 'tracker.refusal.clockRange',
  'Play halves or quarters.': 'tracker.refusal.rules.periods',
  'A period runs 1 to 60 minutes.': 'tracker.refusal.rules.periodLength',
  'Overtime runs 1 to 30 minutes.': 'tracker.refusal.rules.overtimeLength',
  'The bonus starts between 1 and 30 team fouls.': 'tracker.refusal.rules.bonus',
  'The double bonus must come after the bonus.': 'tracker.refusal.rules.doubleBonus',
  'Allow 0 to 10 timeouts of each length.': 'tracker.refusal.rules.timeoutCount',
  'Timeouts are per game or per half.': 'tracker.refusal.rules.timeoutsPer',
  'Allow 0 to 5 timeouts each overtime.': 'tracker.refusal.rules.overtimeTimeouts',
  'Say whether unused timeouts carry over.': 'tracker.refusal.rules.timeoutsCarry',
  'The last-minutes stop clock runs 1 second to 10 minutes, and no longer than a period.':
    'tracker.refusal.rules.lastMinutesLength',
  'The last-minutes stop clock is at the end of each period, each half or the game.':
    'tracker.refusal.rules.lastMinutesScope',
  'The mercy rule starts at a lead of 1 to 100 points.': 'tracker.refusal.rules.mercyLead',
  'A player fouls out after 1 to 20 fouls, or never.': 'tracker.refusal.rules.foulLimit',
  'Team fouls reset each period, each half or once a game.': 'tracker.refusal.rules.teamFoulsReset',
};

/** The engine's refusals with a value written into them, by their shape. */
const refusalShapes: readonly (readonly [RegExp, RefusalKey])[] = [
  [/^It is already .+\.$/, 'tracker.refusal.alreadyThatPeriod'],
  [/^Pick 1–.+ players\.$/, 'tracker.refusal.lineupSize'],
];

/** The message key for a sentence the engine refused with. */
export function refusalKey(engineMessage: string): RefusalKey {
  const fixed = Object.hasOwn(refusals, engineMessage) ? refusals[engineMessage] : undefined;
  if (fixed !== undefined) return fixed;
  for (const [shape, key] of refusalShapes) if (shape.test(engineMessage)) return key;
  return unknownRefusalKey;
}

/** The engine's refusal as a sentence from the message files. */
export function refusalText(engineMessage: string, t: Translate): string {
  const key = refusalKey(engineMessage);
  return key === 'tracker.refusal.lineupSize' ? t(key, { size: basketball.LINEUP_SIZE }) : t(key);
}

/**
 * The message key of each kind of play. A kind the engine gains is a type error here
 * until it has a key, and engine-words.test.ts checks the list against the engine's
 * source as well.
 */
export const playKeys = {
  score: 'tracker.play.score',
  foul: 'tracker.play.foul',
  unfoul: 'tracker.play.unfoul',
  unscore: 'tracker.play.unscore',
  turnover: 'tracker.play.turnover',
  unturnover: 'tracker.play.unturnover',
  'team-turnover': 'tracker.play.team-turnover',
  'team-unturnover': 'tracker.play.team-unturnover',
  timeout: ['tracker.play.timeout.full', 'tracker.play.timeout.short'],
  untimeout: 'tracker.play.untimeout',
  sub: 'tracker.play.sub',
  lineup: 'tracker.play.lineup',
  period: 'tracker.play.period',
  'clock-mode': ['tracker.play.clock-mode.running', 'tracker.play.clock-mode.stop'],
} as const satisfies Readonly<
  Record<basketball.Play['type'], MessageKey | readonly [MessageKey, MessageKey]>
>;

/** A player by id in either team of the rosters the device keeps. */
export function findPlayer(rosters: DeviceRosters, playerId: string): DevicePlayer | undefined {
  return (
    rosters.home.players.find((p) => p.personId === playerId) ??
    rosters.away.players.find((p) => p.personId === playerId)
  );
}

/** A player's name: both parts in the order the language's message gives, or the one there is. */
const fullName = (player: DevicePlayer, t: Translate): string =>
  player.firstName !== '' && player.lastName !== ''
    ? t('tracker.player.fullName', { first: player.firstName, last: player.lastName })
    : player.firstName !== ''
      ? player.firstName
      : player.lastName;

const hasNumber = (player: DevicePlayer): player is DevicePlayer & { jerseyNumber: string } =>
  player.jerseyNumber !== null && player.jerseyNumber !== '';

/**
 * "#4 Jordan Ellis", "Jordan Ellis" with no number, "#12" with no name (S-34), "Player 1"
 * with neither (R-33).
 */
export function playerLabel(player: DevicePlayer | undefined, t: Translate): string {
  if (player === undefined) return t('tracker.player.unknown');
  const name = fullName(player, t);
  if (hasNumber(player)) {
    return name === ''
      ? t('tracker.player.number', { jersey: player.jerseyNumber })
      : t('tracker.player.numberName', { jersey: player.jerseyNumber, name });
  }
  // R-33: one the number and name do not tell apart reads by their place, "Player 1".
  const place = player.ordinal ?? null;
  if (place !== null) {
    return name === ''
      ? t('tracker.player.place', { place })
      : t('tracker.player.namePlace', { name, place });
  }
  return name === '' ? t('tracker.player.unknown') : t('tracker.player.name', { name });
}

/** "#23 Yusuf": the number and first name, for a tight button; the full name with no number. */
export function playerShortLabel(player: DevicePlayer | undefined, t: Translate): string {
  if (player === undefined) return t('tracker.player.unknown');
  if (!hasNumber(player)) return playerLabel(player, t);
  const first = player.firstName !== '' ? player.firstName : player.lastName;
  return first === ''
    ? t('tracker.player.number', { jersey: player.jerseyNumber })
    : t('tracker.player.numberName', { jersey: player.jerseyNumber, name: first });
}

/** "Q3", "H2" or "OT1": a period past the game's own periods is overtime. */
export function periodText(period: number, periods: 2 | 4, t: Translate): string {
  if (period > periods) return t('tracker.period.overtime', { number: period - periods });
  return t(periods === 2 ? 'tracker.period.half' : 'tracker.period.quarter', { number: period });
}

/**
 * A play said shortest, for the Undo button where a phone has room for a few words
 * (step 2.37): what happened first, then who by number and first name ("+2 #4 Jordan"),
 * so a line cut short loses the name, never what happened or the number. The same kinds
 * of play as `playKeys`: a kind the engine gains is a type error here until it has a key.
 */
export function playShortText(
  play: basketball.Play,
  rosters: DeviceRosters,
  periods: 2 | 4,
  t: Translate,
): string {
  const who = (id: string) => playerShortLabel(findPlayer(rosters, id), t);
  const team = (side: basketball.Side) => rosters[side].name;
  switch (play.type) {
    case 'score':
      return t('tracker.play.short.score', { who: who(play.playerId), points: play.points });
    case 'unscore':
      return t('tracker.play.short.unscore', { who: who(play.playerId), points: play.points });
    case 'foul':
    case 'unfoul':
    case 'turnover':
    case 'unturnover':
      return t(`tracker.play.short.${play.type}`, { who: who(play.playerId) });
    case 'team-turnover':
    case 'team-unturnover':
      return t(`tracker.play.short.${play.type}`);
    case 'timeout':
    case 'untimeout':
    case 'lineup':
      return t(`tracker.play.short.${play.type}`, { team: team(play.side) });
    case 'sub':
      return t('tracker.play.short.sub', { who: who(play.inId) });
    case 'period':
      return t('tracker.play.short.period', { period: periodText(play.period, periods, t) });
    case 'clock-mode':
      return t(`tracker.play.short.clock-mode.${play.mode === 'running' ? 'running' : 'stop'}`);
  }
}

/** A play as the tracker says it: in the play log, on Undo, in the "not saved" lists. */
export function playText(
  play: basketball.Play,
  rosters: DeviceRosters,
  periods: 2 | 4,
  t: Translate,
): string {
  const player = (id: string) => playerLabel(findPlayer(rosters, id), t);
  const team = (side: basketball.Side) => rosters[side].name;
  switch (play.type) {
    case 'score':
      return t(playKeys.score, { player: player(play.playerId), points: play.points });
    case 'unscore':
      return t(playKeys.unscore, { player: player(play.playerId), points: play.points });
    case 'foul':
    case 'unfoul':
    case 'turnover':
    case 'unturnover':
      return t(playKeys[play.type], { player: player(play.playerId) });
    case 'team-turnover':
    case 'team-unturnover':
    case 'untimeout':
      return t(playKeys[play.type], { team: team(play.side) });
    case 'timeout':
      return t(playKeys.timeout[play.seconds === 30 ? 1 : 0], { team: team(play.side) });
    case 'sub':
      return t(playKeys.sub, { in: player(play.inId), out: player(play.outId) });
    case 'lineup':
      return t(playKeys.lineup, {
        team: team(play.side),
        players: play.playerIds.map(player).join(t('tracker.play.lineup.separator')),
      });
    case 'period':
      return t(playKeys.period, { period: periodText(play.period, periods, t) });
    case 'clock-mode':
      return t(playKeys['clock-mode'][play.mode === 'running' ? 0 : 1]);
  }
}
