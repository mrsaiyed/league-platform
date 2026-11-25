// A season's rules as the live engine reads them (T-128, S-1). The engine knows the game
// format, the bonus thresholds, the timeouts, the clock mode, and since step 2.122 the
// last-minutes stop clock, the mercy lead and the personal foul limit (step 2.67); the
// rest of a season's rules (standings, rosters, what is recorded) are not the engine's.
// Each of those three is carried only when the season sets it, as the engine itself
// keeps them (`checkRules` in packages/sports): off is left out, never null, so rules
// with none of them read exactly as before (record 062).
//
// When team fouls reset (`fouls.teamFoulsReset`, step 2.123) is carried the same way:
// only when it counts differently from each period, which is what the engine reads when
// it is absent: once a game, or each half in a game of quarters (with halves, each half
// is each period). Overtime continues the last regulation window's count (S-114). A game
// keeps the rules it started with (S-1), so a game begun before a season's change, or
// before this step, keeps counting as it did. The 2.107 audit's note that the bonus "can
// show early" was wrong both ways round: it showed late or never (M8, L8), and no longer.
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
 * without the mercy lead and the last-minutes stop clock, with team fouls counted each
 * period as the tracker counted them, and with the tracker's own way of counting minutes
 * when the clock is set, so it keeps the tracker's numbers (S-71, record 077).
 */
export function trackerEngineRulesOf(rules: SeasonRules): basketball.Rules {
  const {
    minutesFollow: _minutes,
    teamFoulsReset: _reset,
    ...asTracked
  } = engineRulesOf(withoutMercyOrLastMinutes(rules));
  return asTracked;
}

/**
 * When team fouls reset, as the engine keeps it: left out when the season's choice counts
 * the same as each period, the engine's reading when it is absent (step 2.123).
 */
function teamFoulsResetOf(rules: SeasonRules): { teamFoulsReset?: basketball.TeamFoulsReset } {
  const reset = rules.fouls.teamFoulsReset;
  if (reset === 'game' || (reset === 'half' && rules.gameFormat.periods === 4)) {
    return { teamFoulsReset: reset };
  }
  return {};
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
    ...teamFoulsResetOf(rules),
    minutesFollow: 'game-clock',
  };
}
