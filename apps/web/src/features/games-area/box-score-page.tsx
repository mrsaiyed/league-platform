// `/{league}/admin/games/{game}`: the box score grid (step 2.64). A paper score sheet
// is copied into a grid of each team's players and the stats the game's rules keep,
// saved, and the game is final. A final game is shown as it was saved, with a way to
// reopen it with a reason (S-7) and correct it. On a phone the grid scrolls sideways
// inside its own box, never the page (A-2). Words come from the message files (T-187).
//
// Its forms are answered without the address (T-271, record 067, step 2.155): a refusal
// in the response to the post, keeping every box as typed (box-score-sheet-form.tsx,
// reopen-form.tsx); a save by the one-time notice, read here once and said under the
// title, which names the game, naming its score.
import {
  getBoxScoreSheet,
  leagueUrl,
  readReopenOffer,
  type BoxScoreSheet,
  type GameLine,
  type GameRosterPlayer,
} from '@srleagues/core';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { clockTimeText } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { statLabel } from '../stats-pages/index.ts';
import { hasName, rosterName } from '../teams-area/index.ts';
import { reopenBoxScoreAction, saveBoxScoreAction } from './actions.ts';
import { boxScoreField } from './box-score-form.ts';
import { BoxScoreSheetForm, type SheetRow, type SheetTeam } from './box-score-sheet-form.tsx';
import { sheetScoresId } from './form-state.ts';
import { ReopenForm } from './reopen-form.tsx';
import { SavedLine } from './saved-line.tsx';
import { sheetNeedsOffer, sheetReopenViewOf, type ReopenView } from './reopen-view.ts';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A player's name; one added at the scorer's table by number only is "#12" (S-34). */
const nameOf = rosterName;

/** What a box shows to start with: the saved number, or empty. */
function savedText(line: GameLine | undefined, key: string): string {
  const value = line?.stats[key];
  return value === undefined ? '' : String(value);
}

/** A team's rows of the grid, with the words each box is read by. */
function rowsOf(sheet: BoxScoreSheet, players: readonly GameRosterPlayer[]): SheetRow[] {
  const lineOf = new Map(sheet.lines.map((line) => [line.personId, line]));
  return players.map((player) => {
    const line = lineOf.get(player.personId);
    const name = nameOf(player);
    const jersey =
      player.jerseyNumber === null || !hasName(player)
        ? ''
        : `${t('admin.boxScore.jersey', { number: player.jerseyNumber })} `;
    const left = player.left ? ` ${t('admin.boxScore.left')}` : '';
    const minutes =
      line?.secondsPlayed === null || line?.secondsPlayed === undefined
        ? ''
        : String(Math.round(line.secondsPlayed / 60));
    return {
      personId: player.personId,
      heading: `${jersey}${name}${left}`,
      played: {
        field: boxScoreField.played(player.personId),
        label: t('admin.boxScore.playedBy', { name }),
        saved: line?.played === true,
      },
      ...(sheet.minutes
        ? {
            minutes: {
              field: boxScoreField.minutes(player.personId),
              label: t('admin.boxScore.cellLabel', { stat: t('admin.boxScore.minutes'), name }),
              named: t('admin.boxScore.cellLabel', {
                stat: t('admin.boxScore.minutes'),
                name: `${jersey}${name}`,
              }),
              saved: minutes,
            },
          }
        : {}),
      stats: sheet.statKeys.map((key) => ({
        field: boxScoreField.stat(player.personId, key),
        label: t('admin.boxScore.cellLabel', { stat: statLabel(key).full, name }),
        named: t('admin.boxScore.cellLabel', {
          stat: statLabel(key).full,
          name: `${jersey}${name}`,
        }),
        saved: savedText(line, key),
      })),
    };
  });
}

export async function BoxScorePage({
  league,
  gameId,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  /** The route's game value: the game's id. */
  readonly gameId: string;
}) {
  const view = await loadLeaguePage(league, 'admin', 'games');
  const here = view.context.league;
  if (!uuidShape.test(gameId)) return notFound();
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const read = await getBoxScoreSheet(context, { gameId: gameId.toLowerCase() }, ports.games.deps);
  const back = leagueUrl(here, 'admin-area', { area: 'games' });
  if (!read.ok) {
    return (
      <main className="admin-games">
        <p role="alert">{t('admin.boxScore.notFound')}</p>
        <a href={back}>{t('admin.boxScore.back')}</a>
      </main>
    );
  }
  const sheet = read.value;
  const { game } = sheet;
  const names = (await ports.games.namesOf(here.id)).teams;
  const homeName = names[game.homeTeamId] ?? '';
  const awayName = names[game.awayTeamId] ?? '';
  const editable = sheet.locked === null;
  const sheetHref = leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id] });
  const result = (homeScore: string, awayScore: string) =>
    t('admin.games.result', { away: awayName, awayScore, home: homeName, homeScore });
  // What was just saved here, taken (so a reload does not say it again), said where it
  // was done: a reopen under the title, where its form was; a saved sheet beside the
  // scores, just above where its save button was, naming the game and its score.
  const holder = noticeHolderOf(context);
  const notice = holder === undefined ? undefined : savedNoticesHere().take(holder, 'box-score');
  const mine = notice?.thing === game.id ? notice : undefined;
  const reopened = mine?.said === 'reopen' ? t('admin.boxScore.done.reopen') : undefined;
  const saved =
    mine === undefined || reopened !== undefined
      ? undefined
      : game.homeScore !== null && game.awayScore !== null
        ? t('admin.boxScore.saved', {
            result: result(String(game.homeScore), String(game.awayScore)),
          })
        : t('admin.boxScore.done.save');
  // Who may reopen it here, and by which door (reopen-view.ts): the admin's door as the
  // sheet says, else, for a game its tracker ended, the tracker's own read.
  const reopen: ReopenView = sheetReopenViewOf(
    sheet,
    sheetNeedsOffer(sheet)
      ? await readReopenOffer(context, { gameId: game.id }, ports.games.deps).then((offer) =>
          offer.ok ? offer.value : undefined,
        )
      : undefined,
  );
  const { timeZone } = await ports.publicSchedule.clockOf(here.id);
  const sides = [
    { teamId: game.awayTeamId, name: awayName, score: game.awayScore, field: 'awayScore' },
    { teamId: game.homeTeamId, name: homeName, score: game.homeScore, field: 'homeScore' },
  ] as const;
  const teams: readonly SheetTeam[] = sides.map((side) => ({
    teamId: side.teamId,
    name: side.name,
    rows: rowsOf(
      sheet,
      sheet.players.filter((p) => p.teamId === side.teamId),
    ),
    score: {
      field: side.field,
      label: t('admin.games.scoreOf', { team: side.name }),
      saved: side.score === null ? '' : String(side.score),
    },
    wrongScore: t('admin.boxScore.refused.score', { team: side.name }),
  }));
  return (
    <main className="admin-games">
      <p>
        <a href={back}>{t('admin.boxScore.back')}</a>
      </p>
      <h1>{t('admin.boxScore.title', { away: awayName, home: homeName })}</h1>
      {reopened === undefined ? null : <SavedLine text={reopened} />}
      {sheet.locked === null ? (
        <p>{t('admin.boxScore.help')}</p>
      ) : (
        <p>{t(`admin.boxScore.locked.${sheet.locked}`)}</p>
      )}
      {reopen.kind === 'correct' ? (
        <ReopenForm
          action={reopenBoxScoreAction}
          permalink={sheetHref}
          hidden={{
            league,
            gameId: game.id,
            version: String(game.version),
            door: reopen.door,
            requestToken: crypto.randomUUID(),
            // Made once as the form is drawn: a second send of it is the same reopen.
            ...(reopen.door === 'tracked' ? { requestId: crypto.randomUUID() } : {}),
            // A game not entered as a box score is put right on the games list, beside it.
            ...(game.captureMode === 'box' ? {} : { then: 'games' }),
          }}
          texts={{
            ...(reopen.until === null
              ? {}
              : {
                  until: t('admin.games.reopenUntil', {
                    time: clockTimeText(reopen.until, { locale, timeZone }),
                  }),
                }),
            reason: t('admin.boxScore.reopenReason'),
            reopen: t('admin.boxScore.reopen'),
          }}
        />
      ) : reopen.kind === 'who' ? (
        <p data-reopen="who">{t(`admin.games.reopenWho.${reopen.because}`)}</p>
      ) : null}
      <BoxScoreSheetForm
        action={saveBoxScoreAction}
        permalink={`${sheetHref}#${sheetScoresId}`}
        hidden={{
          league,
          gameId: game.id,
          version: String(game.version),
          requestToken: crypto.randomUUID(),
        }}
        teams={teams}
        editable={editable}
        {...(saved === undefined ? {} : { saved })}
        texts={{
          player: t('admin.boxScore.player'),
          played: t('admin.boxScore.played'),
          ...(sheet.minutes
            ? {
                minutes: {
                  short: t('admin.boxScore.minutes.short'),
                  full: t('admin.boxScore.minutes'),
                },
              }
            : {}),
          columns: sheet.statKeys.map((key) => {
            const label = statLabel(key);
            return { key, short: label.short, full: label.full };
          }),
          noPlayers: t('admin.boxScore.noPlayers'),
          scoreHelp: t('admin.boxScore.scoreHelp'),
          save: t('admin.boxScore.save'),
          wrongCell: t('admin.boxScore.refused.cell', { cell: '{cell}' }),
          wrongMinutes: t('admin.boxScore.refused.minutes', { cell: '{cell}' }),
          tie: t('admin.games.refused.tie', { result: result('{homeScore}', '{awayScore}') }),
        }}
        {...(editable && sheet.statKeys.includes('points')
          ? {
              check: {
                teams: teams.map((team) => ({
                  scoreField: team.score.field,
                  personIds: team.rows.map((row) => row.personId),
                  warning: t('admin.boxScore.scoreMismatch', {
                    team: team.name,
                    score: '{score}',
                    points: '{points}',
                  }),
                })),
              },
            }
          : {})}
      />
    </main>
  );
}
