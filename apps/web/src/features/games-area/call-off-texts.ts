// The words of "Forfeit, postpone or cancel" and of "Put it back on its date" for one game
// (step 2.158), from the message files (T-187), for the panel in call-off-forms.tsx. Each
// question names the game; a forfeit's names the team that forfeits, the one that wins and
// the score the league's rules give it; putting a postponement back names its old date.
import { putBackReasons } from '@srleagues/core';
import { t } from '../../server/messages.ts';
import type { CallOffActTexts, CallOffTexts } from './call-off-forms.tsx';

/** What the words are worked out from. */
export type CallOffGame = {
  readonly status: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeName: string;
  readonly awayName: string;
  /** Line-ups a scorer's table set (a scheduled game with "plays"): kept, and said so. */
  readonly hasPlays: boolean;
  readonly forfeitScore: { readonly winner: number; readonly loser: number };
};

/** "Tigers at Lions". */
export const gameNamed = (game: Pick<CallOffGame, 'homeName' | 'awayName'>) =>
  t('admin.games.game', { away: game.awayName, home: game.homeName });

const refusalOf = (game: Pick<CallOffGame, 'homeName' | 'awayName'>) =>
  t('admin.games.refusedAbout', { game: gameNamed(game), problem: '{problem}' });

/** The forfeit's words: its team list away first, as everything else names the teams. */
function forfeitTexts(game: CallOffGame): CallOffActTexts {
  const named = gameNamed(game);
  const sides = [
    { team: game.awayTeamId, name: game.awayName, other: game.homeName },
    { team: game.homeTeamId, name: game.homeName, other: game.awayName },
  ];
  return {
    button: t('admin.games.recordForfeit'),
    yes: t('admin.games.callOff.yes.forfeit'),
    no: t('admin.games.callOff.no.forfeit'),
    choice: {
      label: t('admin.games.forfeitBy'),
      choose: t('admin.games.callOff.chooseTeam'),
      options: sides.map((side) => ({ value: side.team, label: side.name })),
    },
    ask: Object.fromEntries(
      sides.map((side) => [
        side.team,
        // The server cannot know a game was started on a device with no signal: the
        // admin is told what a forfeit does to plays that reach it later.
        `${t('admin.games.callOff.ask.forfeit', {
          team: side.name,
          winner: side.other,
          game: named,
          winnerScore: String(game.forfeitScore.winner),
          loserScore: String(game.forfeitScore.loser),
        })} ${t('admin.games.callOff.ask.forfeitOffline')}`,
      ]),
    ),
  };
}

/**
 * "Forfeit, postpone or cancel" (or, on a postponed game, "Forfeit or cancel instead"),
 * with only the changes this person may make to it.
 */
export function callOffTexts(
  game: CallOffGame,
  offers: {
    readonly forfeit: boolean;
    readonly postpone: boolean;
    readonly cancel: boolean;
    /** Postponing's "give it a new date now": only for whoever may edit the schedule (step 2.53). */
    readonly newDate?: boolean;
  },
): CallOffTexts {
  const named = gameNamed(game);
  const lineups = game.status === 'scheduled' && game.hasPlays;
  return {
    summary: t(
      game.status === 'postponed'
        ? 'admin.games.otherActionsPostponed'
        : 'admin.games.otherActions',
    ),
    refusal: refusalOf(game),
    ready: t('admin.games.callOff.ready'),
    acts: {
      ...(offers.forfeit ? { forfeit: forfeitTexts(game) } : {}),
      ...(offers.postpone
        ? {
            postpone: {
              button: t('admin.games.postpone'),
              yes: t('admin.games.callOff.yes.postpone'),
              ...(offers.newDate === true
                ? { yesNewDate: t('admin.games.callOff.yesNewDate.postpone') }
                : {}),
              no: t('admin.games.callOff.no.postpone'),
              ask: t(
                lineups
                  ? 'admin.games.callOff.ask.postponeLineups'
                  : 'admin.games.callOff.ask.postpone',
                { game: named },
              ),
            },
          }
        : {}),
      ...(offers.cancel
        ? {
            cancel: {
              button: t('admin.games.cancel'),
              yes: t('admin.games.callOff.yes.cancel'),
              no: t('admin.games.callOff.no.cancel'),
              ask: t(
                lineups
                  ? 'admin.games.callOff.ask.cancelLineups'
                  : 'admin.games.callOff.ask.cancel',
                { game: named },
              ),
            },
          }
        : {}),
    },
  };
}

/** "Put it back on its date" for a postponed game (S-75); `when` is its old date and time. */
export function restoreTexts(
  game: Pick<CallOffGame, 'homeName' | 'awayName'>,
  when: string,
): CallOffTexts {
  return {
    summary: t('admin.games.putBack.date'),
    refusal: refusalOf(game),
    ready: t('admin.games.callOff.ready'),
    acts: {
      restore: {
        button: t('admin.games.callOff.restore'),
        yes: t('admin.games.callOff.yes.restore'),
        no: t('admin.games.callOff.no.restore'),
        ask: t('admin.games.callOff.ask.restore', { game: gameNamed(game), when }),
        choice: {
          label: t('admin.games.putBack.reason'),
          choose: t('admin.games.putBack.choose'),
          options: putBackReasons.map((reason) => ({
            value: reason,
            label: t(`admin.games.putBack.reasonsDate.${reason}`),
          })),
        },
      },
    },
  };
}

/** The choice of "Put this game back" (a cancelled game, S-51): why, from the fixed list. */
export function putBackChoice() {
  return {
    name: 'reason',
    label: t('admin.games.putBack.reason'),
    choose: t('admin.games.putBack.choose'),
    options: putBackReasons.map((reason) => ({
      value: reason,
      label: t(`admin.games.putBack.reasons.${reason}`),
    })),
  };
}
