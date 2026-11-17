// A season's rules as the live engine reads them (T-128, S-1). The engine knows the game
// format, the bonus thresholds, the timeouts, the clock mode, and since step 2.122 the
// last-minutes stop clock, the mercy lead and the personal foul limit (step 2.67); the
// rest of a season's rules (standings, rosters, what is recorded) are not the engine's.
// Each of those three is carried only when the season sets it, as the engine itself
// keeps them (`checkRules` in packages/sports): off is left out, never null, so rules
// with none of them read exactly as before (record 062).
//
// ENGINE GAP, for an engine step (2.107 audit, M8; NEW-7): `fouls.teamFoulsReset` is
// not carried. The engine always resets team fouls each period, with overtime
// continuing the last regulation period's count, which is the 'period' setting. A
// season set to reset each half or once a game gets that per-period count in the
// tracker (in quarters the bonus comes late or never) until the engine learns the
// setting; the box score and the standings are not affected.
import type { SeasonRules } from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';

/**
 * The rules with the mercy lead and the last-minutes stop clock off, everything else
 * kept, the foul limit included (it only marks a player). For a game played on a
 * tracker that had neither, brought over later (the transfer, step 2.58): it was
 * played without them, so it is replayed and kept without them (record 062).
 */
export function withoutMercyOrLastMinutes(rules: SeasonRules): SeasonRules {
  const { stopClockScope: _scope, ...clock } = rules.clock;
  return { ...rules, clock: { ...clock, stopClockLastSeconds: null, mercyLead: null } };
}

/**
 * The rules for a game brought over from the Al-Hadi tracker (the transfer, step 2.58):
 * without the mercy lead and the last-minutes stop clock, and with the tracker's own way
 * of counting minutes when the clock is set, so it keeps the tracker's numbers (S-71,
 * record 077).
 */
export function trackerEngineRulesOf(rules: SeasonRules): basketball.Rules {
  const { minutesFollow: _minutes, ...asTracked } = engineRulesOf(withoutMercyOrLastMinutes(rules));
  return asTracked;
}

/**
 * Every game of the new product counts minutes on the game clock (S-71): a clock set
 * wrongly and put right changes nothing. It is not a league's setting, since there is
 * one right answer; a game saved before it keeps the rules it was saved with (S-1).
 */
export function engineRulesOf(rules: SeasonRules): basketball.Rules {
  const { stopClockLastSeconds, stopClockScope, mercyLead } = rules.clock;
  const { playerFoulLimit } = rules.fouls;
  return {
    periods: rules.gameFormat.periods,
    periodSeconds: rules.gameFormat.periodSeconds,
    overtimeSeconds: rules.gameFormat.overtimeSeconds,
    bonusFouls: rules.fouls.bonusFouls,
    doubleBonusFouls: rules.fouls.doubleBonusFouls,
    fullTimeouts: rules.timeouts.full,
    shortTimeouts: rules.timeouts.short,
    timeoutsPer: rules.timeouts.per,
    overtimeTimeouts: rules.timeouts.overtime,
    timeoutsCarry: rules.timeouts.carry,
    clockMode: rules.clock.mode,
    // Where the last seconds are counts only when there are last seconds.
    ...(stopClockLastSeconds === null ? {} : { stopClockLastSeconds }),
    ...(stopClockLastSeconds === null || stopClockScope === undefined ? {} : { stopClockScope }),
    ...(mercyLead === null ? {} : { mercyLead }),
    ...(playerFoulLimit === null ? {} : { playerFoulLimit }),
    minutesFollow: 'game-clock',
  };
}
