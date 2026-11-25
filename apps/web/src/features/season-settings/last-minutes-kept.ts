// The sentence under the start form's clock question (step 2.245, review M1; narrowed by
// step 2.248, T-428): the start form does not ask the last-minutes stop clock, and the new
// season keeps the copied one with either clock (S-113, S-123), so the form says so, but
// only when the season being copied has one.
import type { SeasonRules } from '@srleagues/contracts';
import { locale, t } from '../../server/messages.ts';

const minutes = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

/** The sentence, or undefined when nothing is copied or the copied season has none. */
export function lastMinutesKeptNote(
  copiedFrom: string | undefined,
  rules: SeasonRules,
): string | undefined {
  const last = rules.clock.stopClockLastSeconds;
  if (copiedFrom === undefined || last === null) return undefined;
  // The message file's plural form: 60 seconds is "the last minute", never "1 minutes".
  return t.plural('seasonSettings.start.clockKeepsLastMinutes', last / 60, {
    season: copiedFrom,
    minutes: minutes.format(last / 60),
  });
}
