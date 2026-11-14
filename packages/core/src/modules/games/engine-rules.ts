// A season's rules as the live engine reads them (T-128, S-1). The engine knows the game
// format, the bonus thresholds, the timeouts and the clock mode; the rest of a season's
// rules (standings, rosters, what is recorded) are not the engine's. Step 2.68 adds the
// last-minutes stop clock, the mercy lead and the foul limit once the engine has them
// (step 2.67).
//
// ENGINE GAP, for step 2.68: `fouls.teamFoulsReset` is not carried. The engine always
// resets team fouls each period, with overtime continuing the last regulation period's
// count, which is the 'period' setting. A season set to reset each half or once a game
// gets that per-period count in the tracker (the bonus can show early) until the engine
// learns the setting; the box score and the standings are not affected.
import type { SeasonRules } from '@srleagues/contracts';
import type { basketball } from '@srleagues/sports';

export function engineRulesOf(rules: SeasonRules): basketball.Rules {
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
  };
}
