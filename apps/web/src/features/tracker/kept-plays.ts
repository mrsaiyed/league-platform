// The "not saved" list play by play (step 2.37, part 2; T6 §5): each tap this device made
// that will not be sent, in the tracker's words, with the period and game clock it was
// made at (finding I), so the scorekeeper can enter again the ones that are needed. A
// tap that is a play is said as the play log says it (engine-words.ts); the clock, Undo,
// End game and changes of players are said in words of their own. No drawing here.
import type { Translate } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { periodText, playText } from './engine-words.ts';
import type { DeviceRosters } from './opened-game-storage.ts';
import type { KeptTap } from './queue-storage.ts';
import type { RefusedCommand } from './tracker-queue.ts';

/** One play of the list. */
export type KeptRow = {
  /** The tap's id. */
  readonly id: string;
  /** "#4 Jordan Ellis +2", or "Clock started". */
  readonly text: string;
  /** "Q2 7:41"; null for a tap stored before its moment was kept. */
  readonly when: string | null;
  /** Whether it is a play that "Enter again" makes anew (S-77): not the clock, Undo… */
  readonly again: boolean;
};

type Input = KeptTap['command']['input'];

/** The taps that are plays: said exactly as the play log says them. */
const playTypes = new Set<basketball.Play['type']>([
  'lineup',
  'score',
  'foul',
  'unfoul',
  'turnover',
  'unturnover',
  'team-turnover',
  'team-unturnover',
  'timeout',
  'untimeout',
  'sub',
  'period',
  'clock-mode',
]);

const isPlay = (input: Input): input is Input & basketball.Play =>
  (playTypes as ReadonlySet<string>).has(input.type);

/**
 * Whether a kept tap may be entered again (step 2.37, part 2; S-77): a play, made anew
 * now by the path of a tap. The clock, Undo, Redo, End game, the colors and changes of a
 * team's players belong to their moment and are not.
 */
export const mayEnterAgain = isPlay;

function tapText(input: Input, rosters: DeviceRosters, periods: 2 | 4, t: Translate): string {
  if (isPlay(input)) return playText(input, rosters, periods, t);
  switch (input.type) {
    case 'start':
      return t('tracker.kept.start');
    case 'pause':
      return t('tracker.kept.pause');
    case 'set-clock':
      return t('tracker.kept.setClock', { clock: basketball.formatClock(input.ms) });
    case 'undo':
      return t('tracker.kept.undo');
    case 'redo':
      return t('tracker.kept.redo');
    case 'colors':
      return t('tracker.kept.colors');
    case 'end':
      return t('tracker.kept.end');
    default:
      // A change of a team's players (added, changed or taken off the table's list).
      return t('tracker.kept.players');
  }
}

/** The list, oldest first, as the taps were made. */
export function keptRows(
  taps: readonly KeptTap[],
  rosters: DeviceRosters,
  periods: 2 | 4,
  t: Translate,
): readonly KeptRow[] {
  return taps.map(({ command, moment }) => ({
    id: command.commandId,
    text: tapText(command.input, rosters, periods, t),
    again: isPlay(command.input),
    when:
      moment === null
        ? null
        : t('tracker.log.row', {
            period: periodText(moment.period, periods, t),
            clock: basketball.formatClock(moment.clockMs),
          }),
  }));
}

/**
 * The "not applied" list play by play (step 2.37, part 2): each tap the league refused,
 * oldest first, in the same words. The league keeps no moment for a refused tap, so
 * none is said. An End game the league did not take is said by the pad, not here, as
 * the notice's count leaves it out (tracker-notice.ts).
 */
export function notAppliedRows(
  refused: readonly RefusedCommand[],
  rosters: DeviceRosters,
  periods: 2 | 4,
  t: Translate,
): readonly KeptRow[] {
  const taps = refused
    .filter(({ command }) => !('input' in command && command.input.type === 'end'))
    .map(({ command }) => ({ command, moment: null }));
  return keptRows(taps, rosters, periods, t);
}
