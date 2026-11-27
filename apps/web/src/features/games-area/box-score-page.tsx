// `/{league}/admin/games/{game}`: the box score grid (step 2.64). A paper score sheet
// is copied into a grid of each team's players and the stats the game's rules keep,
// saved, and the game is final. A final game is shown as it was saved, with a way to
// reopen it with a reason (S-7) and correct it. A postponed or cancelled game has no grid
// (step 2.158, M32): its page says why, and a cancelled one can be put back from it. On a phone the grid scrolls sideways
// inside its own box, never the page (A-2). Words come from the message files (T-187).
//
// Its forms are answered without the address (T-271, record 067, step 2.155): a refusal
// in the response to the post, keeping every box as typed (box-score-sheet-form.tsx,
// reopen-form.tsx); a save by the one-time notice, read here once and said under the
// title, which names the game, naming its score.
import {
  getBoxScoreSheet,
  leagueUrl,
  readGameFormat,
  readOwnResultOffer,
  readReopenOffer,
  readSheetPutBackOffer,
  readTrackedBoxScore,
  type BoxScoreSheet,
  type GameLine,
  type GameRosterPlayer,
  type LeagueAddressee,
} from '@srleagues/core';
import { en, finalPillOf } from '@srleagues/site';
import { formatWords } from '../game-format/index.ts';
import { GameFormatSection } from './game-format-section.tsx';
import { FinalStatePill, MessagePage, PageHead } from '@srleagues/ui';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { clockTimeText, gameWhenText } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t } from '../../server/messages.ts';
import { scoringNameText } from '../../server/scoring-name-text.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { StaffTrail } from '../staff/index.ts';
import { statLabel } from '../stats-pages/index.ts';
import { hasName, rosterName } from '../teams-area/index.ts';
import { ActionForm } from './action-form.tsx';
import { EndAgainForm } from './end-again-form.tsx';
import {
  callOffAction,
  putBackAction,
  endTrackedGameAgainAction,
  putSheetBackAction,
  reopenBoxScoreAction,
  saveBoxScoreAction,
} from './actions.ts';
import { CallOffForms } from './call-off-forms.tsx';
import { putBackChoice, restoreTexts } from './call-off-texts.ts';
import { waitingListAnchor } from './waiting-anchor.ts';
import { boxScoreField } from './box-score-form.ts';
import { calledOffPanelOf, readsTrackedGrid, trackedGridLinkOf } from './box-score-page-parts.ts';
import { BoxScoreSheetForm, type SheetRow, type SheetTeam } from './box-score-sheet-form.tsx';
import { sheetScoresId } from './form-state.ts';
import { putBackProblemKey } from './problem-keys.ts';
import { ReopenForm } from './reopen-form.tsx';
import { SaidLine } from '../list-forms/said-line.tsx';
import { sheetNeedsOffer, sheetReopenViewOf, type ReopenView } from './reopen-view.ts';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A player's name by the scoring screens' rule (R-33, the games store gives it), a place
 * worded in ("Player 1", T-483); one added at the scorer's table by number only is "#12"
 * (S-34).
 */
const nameOf = rosterName;

/** What a box shows to start with: the saved number, or empty. */
function savedText(line: GameLine | undefined, key: string): string {
  const value = line?.stats[key];
  return value === undefined ? '' : String(value);
}

/** A team's rows of the grid, with the words each box is read by. */
function rowsOf(sheet: BoxScoreSheet, players: readonly GameRosterPlayer[]): SheetRow[] {
  const lineOf = new Map(sheet.lines.map((line) => [line.personId, line]));
  return players.map((listed) => {
    const player = { ...listed, ...scoringNameText(listed) };
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
  // Any game this person cannot open here is "Page not found" with status 404, inside the
  // admin's frame, in this page's own words (BoxScoreNotFound; step 2.157): a game that is
  // not this league's (another league's among them: nothing of it is said), and one they
  // may not score. The second is not answered as a refusal: who may score is checked before
  // the game is looked up, so it never tells an existing game from a missing one. In a
  // league that is archived or suspended the sheet still shows, to the same people, locked
  // by the league's state: no reopen, no put back, no save, one line saying why (T-519).
  if (!read.ok) return notFound();
  const sheet = read.value;
  const { game } = sheet;
  const readOnly = sheet.locked === 'archived' || sheet.locked === 'suspended';
  // The game's own format (step 2.119): shown to whoever may reach it, the admin's
  // "games.manage" or the game's scorekeeper; left out for anyone else.
  const format = await readGameFormat(context, { gameId: game.id }, ports.tracker.deps);
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
  const reopened =
    mine?.said === 'reopen'
      ? t(
          sheet.locked === 'tracked'
            ? 'admin.boxScore.done.reopenTracked'
            : 'admin.boxScore.done.reopen',
        )
      : mine?.said === 'put-back'
        ? t('admin.boxScore.done.putBack')
        : undefined;
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
    // A result recorded by hand, for someone who may not reopen it as a corrector: their
    // own door within the league's minutes, else who can (step 2.177, S-52).
    !readOnly && !sheet.mayReopen && (game.status === 'final' || game.status === 'forfeit')
      ? await readOwnResultOffer(context, { gameId: game.id }, ports.games.deps).then((own) =>
          own.ok ? own.value : undefined,
        )
      : undefined,
  );
  // "Put the sheet back as it was" (step 2.229, T-366): for whoever may correct games, while
  // the game's newest correction is the reopen that kept its sheet and nothing newer was
  // saved; the same rule the put back follows, read before the tap. A kept sheet whose
  // player is in the bin, or purged from it, says so here, before a reason is typed.
  const offer =
    sheet.mayCorrect && (game.status === 'final' || game.status === 'forfeit')
      ? await readSheetPutBackOffer(context, { gameId: game.id }, ports.games.deps)
      : undefined;
  const putBack = offer !== undefined && offer.ok && offer.value.offered;
  const putBackBlocked =
    offer !== undefined &&
    offer.ok &&
    !offer.value.offered &&
    (offer.value.code === 'player-in-bin' || offer.value.code === 'player-gone')
      ? offer.value.code
      : undefined;
  // A game scored with the tracker is edited in its own grid, as plays (step 2.65): the
  // way there once it is reopened with a reason, else what to do first. In a read-only
  // league the grid is viewed there, for whoever its read lets in (T-519).
  const tracked = readsTrackedGrid(sheet)
    ? await readTrackedBoxScore(context, { gameId: game.id }, ports.games.deps)
    : undefined;
  const trackedGrid = tracked !== undefined && tracked.ok ? tracked.value : undefined;
  const gridLink = trackedGrid === undefined ? null : trackedGridLinkOf(trackedGrid);
  const gridHref = leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id, 'edit'] });
  const { timeZone } = await ports.publicSchedule.clockOf(here.id);
  // Postponed or cancelled: no box score, no grid; the way it is put back (step 2.158).
  // Said by the game's own state, so a league that is read-only keeps it (T-519).
  const calledOff = game.status === 'cancelled' || game.status === 'postponed';
  const calledOffPanel = calledOffPanelOf(game.status, sheet.mayCallOff);
  const named = t('admin.games.game', { away: awayName, home: homeName });
  const calledOffHidden = {
    league,
    gameId: game.id,
    version: String(game.version),
    then: 'games',
  };
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
    <main className="admin-games admin-sheet">
      <StaffTrail
        steps={[{ href: back, label: t('admin.area.games') }]}
        here={t('admin.games.game', { away: awayName, home: homeName })}
      />
      <PageHead
        title={t(calledOff ? 'admin.boxScore.titleCalledOff' : 'admin.boxScore.title', {
          away: awayName,
          home: homeName,
        })}
        sub={
          sheet.locked === null
            ? t('admin.boxScore.help')
            : t(`admin.boxScore.locked.${sheet.locked}`)
        }
      >
        {/* A final game's state, as its card says it: "Final", or "Final, OT" for one the
            tracker ended in overtime (step 2.200). */}
        {game.status === 'final' ? (
          <FinalStatePill
            label={t('display.final')}
            finalPill={finalPillOf(t, game.overtimePeriods)}
          />
        ) : null}
      </PageHead>
      {reopened === undefined ? null : <SaidLine kind="saved">{reopened}</SaidLine>}
      {format.ok ? (
        <GameFormatSection
          leagueId={here.id}
          gameId={game.id}
          locale={locale}
          words={formatWords(en)}
          initial={format.value}
          title={t('tracker.formatChange.title')}
        />
      ) : null}
      {putBack ? (
        <div className="staff-panel">
          <ReopenForm
            kind="put-back"
            action={putSheetBackAction}
            permalink={sheetHref}
            hidden={{
              league,
              gameId: game.id,
              version: String(game.version),
              requestToken: crypto.randomUUID(),
            }}
            texts={{
              help: t('admin.boxScore.putBackHelp'),
              reason: t('admin.boxScore.putBackReason'),
              reopen: t('admin.boxScore.putBack'),
            }}
          />
        </div>
      ) : null}
      {putBackBlocked === undefined ? null : (
        <div className="staff-panel">
          <p data-put-back-blocked={putBackBlocked}>{t(putBackProblemKey(putBackBlocked))}</p>
        </div>
      )}
      {reopen.kind === 'correct' ? (
        <div className="staff-panel">
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
              // A game not entered as a box score is put right on the games list, beside it;
              // a tracked game someone here may correct comes back here, to its grid (2.65).
              ...(game.captureMode === 'box' || trackedGrid !== undefined ? {} : { then: 'games' }),
            }}
            texts={{
              ...(reopen.until === null
                ? {}
                : {
                    until: t(
                      reopen.door === 'own'
                        ? 'admin.games.reopenUntilOwn'
                        : 'admin.games.reopenUntil',
                      {
                        time: clockTimeText(reopen.until, { locale, timeZone }),
                      },
                    ),
                  }),
              reason: t('admin.boxScore.reopenReason'),
              reopen: t('admin.boxScore.reopen'),
            }}
          />
        </div>
      ) : reopen.kind === 'who' ? (
        <p className="ui-notice" data-reopen="who">
          {t(`admin.games.reopenWho.${reopen.because}`)}
        </p>
      ) : null}
      {trackedGrid === undefined ? null : (
        <div className="staff-panel">
          {gridLink === 'edit' ? (
            <p>
              <a className="ui-button" data-kind="main" href={gridHref}>
                {t('admin.boxScore.tracked.edit')}
              </a>
            </p>
          ) : null}
          {trackedGrid.correctable ? (
            <EndAgainForm
              action={endTrackedGameAgainAction}
              permalink={sheetHref}
              hidden={{
                league,
                gameId: game.id,
                sequence: String(trackedGrid.sequence),
                requestToken: crypto.randomUUID(),
              }}
              texts={{
                help: t('admin.boxScore.tracked.endAgainHelp'),
                button: t('admin.boxScore.tracked.endAgain'),
                reload: t('admin.boxScore.tracked.reload'),
              }}
            />
          ) : (
            <>
              <p data-grid-closed={trackedGrid.notCorrectable}>
                {t(
                  `admin.boxScore.tracked.notCorrectable.${trackedGrid.notCorrectable ?? 'game-not-live'}`,
                )}
              </p>
              {gridLink === 'view' ? (
                <p>
                  <a className="ui-more" href={gridHref}>
                    {t('admin.boxScore.tracked.view')}
                  </a>
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
      {calledOffPanel !== null ? (
        // Its own page puts it back too (step 2.158, S-51, S-75), so a game called off
        // outside this week's list is never stuck: a cancelled one to what it was, a
        // postponed one on its date (asking first), with the way to the games waiting for a
        // new date. For whoever may call it off (games.results); the command checks again.
        // Done, it goes to the games list, where "Saved" names it.
        <div className="staff-panel ui-stack">
          {calledOffPanel.waitingLink ? (
            <p>
              <a className="ui-more" href={`${back}#${waitingListAnchor}`}>
                {t('admin.games.waiting.link')}
              </a>
            </p>
          ) : null}
          {calledOffPanel.form === null ? null : calledOffPanel.form === 'put-back' ? (
            <ActionForm
              action={putBackAction}
              permalink={sheetHref}
              hidden={{ ...calledOffHidden, requestToken: crypto.randomUUID() }}
              summary={t('admin.games.putBack')}
              choice={putBackChoice()}
              button={t('admin.games.putBack.save')}
              refusal={t('admin.games.refusedAbout', { game: named, problem: '{problem}' })}
            />
          ) : (
            <CallOffForms
              action={callOffAction}
              permalink={sheetHref}
              hidden={{ ...calledOffHidden, requestToken: crypto.randomUUID() }}
              summaryButton
              texts={restoreTexts(
                { homeName, awayName },
                gameWhenText(game.startsAt, { locale, timeZone }),
              )}
            />
          )}
        </div>
      ) : null}
      {calledOff ? null : (
        // A game called off has no score to enter (step 2.158, M32): no grid at all.
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
            teamShown: t('admin.boxScore.teamShown'),
            columnsKey: t('admin.boxScore.columnsKey'),
            noPlayers: t('admin.boxScore.noPlayers'),
            empty: t('admin.boxScore.empty'),
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
      )}
    </main>
  );
}

/**
 * "Page not found" at a game's box score address, for someone with the admin's Games area
 * (app/[league]/admin/games/[game]/not-found.tsx, step 2.157): a game that is not there for
 * them to score, with the way back to the games. The admin's frame is drawn around it.
 */
export function BoxScoreNotFound({ league }: { readonly league: LeagueAddressee }) {
  return (
    <MessagePage
      className="admin-games"
      title={t('common.notFoundTitle')}
      action={{
        href: leagueUrl(league, 'admin-area', { area: 'games' }),
        label: t('admin.boxScore.back'),
      }}
    >
      <p>{t('admin.boxScore.notFound')}</p>
    </MessagePage>
  );
}
