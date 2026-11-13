import { z } from 'zod';

/**
 * A season's rules document (P7 section 1; S-1, S-21). Stored as JSON with a version number
 * (T-50, T-104); `upgradeSeasonRules` brings any older document to the current version, so
 * a format change never requires rewriting every season at once.
 *
 * Nothing here names a league: differences between leagues are values in this document.
 *
 * Limits of the period, overtime and bonus numbers match `Rules` in ./live-stats.ts (the
 * tracker's rules); a test keeps the two from drifting apart.
 */
export const SEASON_RULES_VERSION = 1;

export const StatSet = z.enum(['points-only', 'points-fouls', 'standard', 'full']);
export const StandingsColumn = z.enum([
  'played',
  'wins',
  'losses',
  'ties',
  'win-percentage',
  'points',
  'points-for',
  'points-against',
  'point-difference',
  'streak',
  'last-five',
]);
export const Tiebreaker = z.enum([
  'head-to-head',
  'point-difference',
  'points-scored',
  'fewest-points-allowed',
  'coin-flip',
]);
export const RecordingMode = z.enum(['final-score', 'box-score', 'live']);

const count = (min: number, max: number) => z.number().int().min(min).max(max);

const GameFormat = z.strictObject({
  /** 2 for halves, 4 for quarters. */
  periods: z.union([z.literal(2), z.literal(4)]),
  periodSeconds: count(60, 3600),
  overtimeSeconds: count(60, 1800),
});

const Clock = z.strictObject({
  mode: z.enum(['stop', 'running']),
  /** Extra for a running clock: it stops by itself in the final seconds (null for none). */
  stopClockLastSeconds: count(1, 600).nullable(),
  /** Where those final seconds are: each period, each half or the game. Read as 'half' when absent. */
  stopClockScope: z.enum(['period', 'half', 'game']).optional(),
  /** Extra for a stop clock: a lead that switches the game to a running clock (null for none). */
  mercyLead: count(1, 100).nullable(),
});

const Fouls = z.strictObject({
  teamFoulsReset: z.enum(['period', 'half', 'game']),
  bonusFouls: count(1, 30),
  doubleBonusFouls: count(2, 40).nullable(),
  /** Personal fouls that put a player out; null means no limit. */
  playerFoulLimit: count(1, 20).nullable(),
});

/** Mirrors the tracker's timeout rules. P7's table does not list them; S-21 makes them settings. */
const Timeouts = z.strictObject({
  full: count(0, 10),
  short: count(0, 10),
  per: z.enum(['game', 'half']),
  overtime: count(0, 5),
  carry: z.boolean(),
});

const Standings = z.strictObject({
  rankBy: z.enum(['win-percentage', 'points']),
  /** Used when ranking by points. */
  pointsPerWin: count(0, 10),
  pointsPerTie: count(0, 10),
  pointsPerLoss: count(0, 10),
  columns: z.array(StandingsColumn).min(1).max(StandingsColumn.options.length),
});

const Forfeit = z.strictObject({
  winnerScore: count(0, 200),
  loserScore: count(0, 200),
  countsInPointDifference: z.boolean(),
});

const Rosters = z.strictObject({
  minSize: count(0, 100).nullable(),
  maxSize: count(1, 100).nullable(),
  /** The day rosters lock, as YYYY-MM-DD; null for no lock. */
  locksOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date written year-month-day.')
    .refine((d) => {
      const t = new Date(`${d}T00:00:00Z`);
      return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
    }, 'Use a real date.')
    .nullable(),
  uniqueJerseys: z.boolean(),
});

export const SeasonRules = z
  .strictObject({
    version: z.literal(SEASON_RULES_VERSION),
    gameFormat: GameFormat,
    clock: Clock,
    fouls: Fouls,
    timeouts: Timeouts,
    recording: RecordingMode,
    statistics: StatSet,
    standings: Standings,
    tiebreakers: z.array(Tiebreaker).max(Tiebreaker.options.length),
    allowTies: z.boolean(),
    forfeit: Forfeit,
    rosters: Rosters,
  })
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (r.fouls.doubleBonusFouls !== null && r.fouls.doubleBonusFouls <= r.fouls.bonusFouls) {
      issue(['fouls', 'doubleBonusFouls'], 'The double bonus must start after the bonus.');
    }
    if (r.forfeit.winnerScore <= r.forfeit.loserScore) {
      issue(['forfeit', 'winnerScore'], 'The winner of a forfeit must score more than the loser.');
    }
    if (
      r.rosters.minSize !== null &&
      r.rosters.maxSize !== null &&
      r.rosters.minSize > r.rosters.maxSize
    ) {
      issue(['rosters', 'minSize'], 'The smallest roster cannot be larger than the largest.');
    }
    if (new Set(r.tiebreakers).size !== r.tiebreakers.length) {
      issue(['tiebreakers'], 'Each tiebreaker can be listed only once.');
    }
    const coin = r.tiebreakers.indexOf('coin-flip');
    if (coin !== -1 && coin !== r.tiebreakers.length - 1) {
      issue(['tiebreakers'], 'A coin flip always decides last, so nothing can follow it.');
    }
    const st = r.standings;
    if (new Set(st.columns).size !== st.columns.length) {
      issue(['standings', 'columns'], 'Each column can be listed only once.');
    }
    if (st.rankBy === 'points' && !st.columns.includes('points')) {
      issue(['standings', 'columns'], 'A table ranked by points must show the points column.');
    }
    if (!r.allowTies && st.columns.includes('ties')) {
      issue(['standings', 'columns'], 'There is no ties column when ties are not allowed.');
    }
    if (st.pointsPerWin < st.pointsPerTie || st.pointsPerTie < st.pointsPerLoss) {
      issue(
        ['standings', 'pointsPerWin'],
        'A win must be worth at least a tie, and a tie at least a loss.',
      );
    }
    if (r.clock.mode === 'stop' && r.clock.stopClockLastSeconds !== null) {
      issue(
        ['clock', 'stopClockLastSeconds'],
        'A stop clock for the last minutes only applies to a running clock.',
      );
    }
    if (
      r.clock.stopClockLastSeconds !== null &&
      r.clock.stopClockLastSeconds > r.gameFormat.periodSeconds
    ) {
      issue(
        ['clock', 'stopClockLastSeconds'],
        'The stop-clock time cannot be longer than a period.',
      );
    }
    if (r.clock.mode === 'running' && r.clock.mercyLead !== null) {
      issue(['clock', 'mercyLead'], 'A mercy rule only applies to a stop clock.');
    }
    // Live tracking records fouls as well as points, so a points-only season cannot use it.
    // Final-score and box-score games may use any set: the set only limits what is shown.
    if (r.recording === 'live' && r.statistics === 'points-only') {
      issue(['statistics'], 'Live tracking records fouls as well; keep at least points and fouls.');
    }
  });

export type SeasonRules = z.infer<typeof SeasonRules>;

/** Basketball defaults of P7 section 1 (halves, running clock); also the "custom" start. */
export function defaultSeasonRules(): SeasonRules {
  return {
    version: SEASON_RULES_VERSION,
    gameFormat: { periods: 2, periodSeconds: 1200, overtimeSeconds: 300 },
    clock: { mode: 'running', stopClockLastSeconds: null, mercyLead: null },
    fouls: { teamFoulsReset: 'half', bonusFouls: 7, doubleBonusFouls: 10, playerFoulLimit: 5 },
    timeouts: { full: 2, short: 0, per: 'half', overtime: 1, carry: false },
    recording: 'live',
    statistics: 'standard',
    standings: {
      rankBy: 'win-percentage',
      pointsPerWin: 2,
      pointsPerTie: 1,
      pointsPerLoss: 0,
      columns: ['played', 'wins', 'losses', 'win-percentage', 'point-difference'],
    },
    tiebreakers: ['head-to-head', 'point-difference', 'points-scored'],
    allowTies: false,
    forfeit: { winnerScore: 20, loserScore: 0, countsInPointDifference: false },
    rosters: { minSize: null, maxSize: null, locksOn: null, uniqueJerseys: false },
  };
}

export const SEASON_RULES_PRESETS = ['high-school', 'rec-league', 'custom'] as const;
export type SeasonRulesPreset = (typeof SEASON_RULES_PRESETS)[number];

/** A fresh document for a preset. Every value can be changed afterwards (S-1). */
export function seasonRulesPreset(preset: SeasonRulesPreset): SeasonRules {
  const base = defaultSeasonRules();
  switch (preset) {
    // Mirrors the tracker's quarters format: 8-minute quarters, bonus on the 5th.
    case 'high-school':
      return {
        ...base,
        gameFormat: { periods: 4, periodSeconds: 480, overtimeSeconds: 240 },
        clock: { mode: 'stop', stopClockLastSeconds: null, mercyLead: null },
        fouls: {
          teamFoulsReset: 'period',
          bonusFouls: 5,
          doubleBonusFouls: null,
          playerFoulLimit: 5,
        },
        timeouts: { full: 3, short: 2, per: 'game', overtime: 1, carry: false },
      };
    // The P7 defaults, which are the tracker's halves format.
    case 'rec-league':
    case 'custom':
      return base;
  }
}

/** The flat shape from before versions existed; read only so old data still opens. */
const V0_KEYS: readonly string[] = [
  'periods',
  'periodSeconds',
  'overtimeSeconds',
  'clock',
  'bonusFouls',
  'doubleBonusFouls',
  'allowTies',
  'forfeitScore',
  'version',
];
const SeasonRulesV0 = z.looseObject({
  periods: z.union([z.literal(2), z.literal(4)]).optional(),
  periodSeconds: count(60, 3600).optional(),
  overtimeSeconds: count(60, 1800).optional(),
  clock: z.enum(['stop', 'running']).optional(),
  bonusFouls: count(1, 30).optional(),
  doubleBonusFouls: count(2, 40).nullable().optional(),
  allowTies: z.boolean().optional(),
  forfeitScore: count(1, 200).optional(),
});

export type UpgradeFailure = 'unknown-version' | 'bad-version' | 'invalid';
export type UpgradeResult =
  | { ok: true; rules: SeasonRules; warnings: string[] }
  | { ok: false; reason: UpgradeFailure; message: string };

const UPGRADE_MESSAGES = {
  'unknown-version': 'These rules were saved by a newer version of the product.',
  'bad-version': 'These rules have a version number that is not valid.',
  invalid: 'The rules are not valid.',
} satisfies Record<UpgradeFailure, string>;

type Step = (document: unknown, warnings: string[]) => unknown;

/** One step per version: STEPS[n] turns a version-n document into version n + 1. */
const STEPS: Record<number, Step> = {
  0: (stored, warnings) => {
    const old = SeasonRulesV0.parse(stored);
    for (const key of Object.keys(old)) {
      if (!V0_KEYS.includes(key)) {
        warnings.push(`The setting "${key}" is not used any more and was dropped.`);
      }
    }
    const d = defaultSeasonRules();
    const bonusFouls = old.bonusFouls ?? d.fouls.bonusFouls;
    let doubleBonusFouls =
      old.doubleBonusFouls === undefined ? d.fouls.doubleBonusFouls : old.doubleBonusFouls;
    if (doubleBonusFouls !== null && doubleBonusFouls <= bonusFouls) {
      // The old bonus reaches the default double bonus: keep the bonus, drop the double.
      doubleBonusFouls = null;
      warnings.push('The double bonus was removed because it did not come after the bonus.');
    }
    return {
      ...d,
      version: 1,
      gameFormat: {
        periods: old.periods ?? d.gameFormat.periods,
        periodSeconds: old.periodSeconds ?? d.gameFormat.periodSeconds,
        overtimeSeconds: old.overtimeSeconds ?? d.gameFormat.overtimeSeconds,
      },
      clock: { ...d.clock, mode: old.clock ?? d.clock.mode },
      fouls: { ...d.fouls, bonusFouls, doubleBonusFouls },
      allowTies: old.allowTies ?? d.allowTies,
      forfeit: { ...d.forfeit, winnerScore: old.forfeitScore ?? d.forfeit.winnerScore },
    };
  },
};

/**
 * Reads a stored document of any version and returns the current one, one version step at
 * a time. A document from a newer version than this code knows is refused rather than
 * guessed at; anything dropped on the way is reported in `warnings`.
 */
export function upgradeSeasonRules(stored: unknown): UpgradeResult {
  let version: unknown = 0;
  if (typeof stored === 'object' && stored !== null && 'version' in stored) {
    version = (stored as { version: unknown }).version;
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, reason: 'bad-version', message: UPGRADE_MESSAGES['bad-version'] };
  }
  if (version > SEASON_RULES_VERSION) {
    return { ok: false, reason: 'unknown-version', message: UPGRADE_MESSAGES['unknown-version'] };
  }

  const warnings: string[] = [];
  let document = stored;
  try {
    for (let v = version; v < SEASON_RULES_VERSION; v += 1) {
      const step = STEPS[v];
      if (!step) throw new Error(`No upgrade from version ${v}.`);
      document = step(document, warnings);
    }
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? UPGRADE_MESSAGES.invalid)
        : 'The rules could not be upgraded.';
    return { ok: false, reason: 'invalid', message };
  }

  const parsed = SeasonRules.safeParse(document);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: parsed.error.issues[0]?.message ?? UPGRADE_MESSAGES.invalid,
    };
  }
  return { ok: true, rules: parsed.data, warnings };
}
