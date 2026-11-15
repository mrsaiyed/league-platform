// `/{league}/admin/games/{game}`: the box score grid (step 2.64). A paper score sheet
// is copied into a grid of each team's players and the stats the game's rules keep,
// saved, and the game is final. A final game is shown as it was saved, with a way to
// reopen it with a reason (S-7) and correct it. On a phone the grid scrolls sideways
// inside its own box, never the page (A-2). Words come from the message files (T-187).
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
import { locale, t, type TextKey } from '../../server/messages.ts';
import { sheetNeedsOffer, sheetReopenViewOf, type ReopenView } from './reopen-view.ts';
import { statLabel } from '../stats-pages/index.ts';
import { hasName, rosterName } from '../teams-area/index.ts';
import { reopenBoxScoreAction, saveBoxScoreAction } from './actions.ts';
import { boxScoreField } from './box-score-form.ts';
import { boxScoreNotice } from './box-score-notice.ts';
import type { SearchParams } from './games-search.ts';
import { ScoreCheck } from './score-check.tsx';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A player's name; one added at the scorer's table by number only is "#12" (S-34). */
const nameOf = rosterName;

/** What a box shows to start with: the saved number, or empty. */
function savedText(line: GameLine | undefined, key: string): string {
  const value = line?.stats[key];
  return value === undefined ? '' : String(value);
}

function TeamGrid({
  sheet,
  teamName,
  players,
  editable,
}: {
  readonly sheet: BoxScoreSheet;
  readonly teamName: string;
  readonly players: readonly GameRosterPlayer[];
  readonly editable: boolean;
}) {
  const lineOf = new Map(sheet.lines.map((line) => [line.personId, line]));
  const columns = sheet.statKeys.map((key) => ({ key, label: statLabel(key) }));
  return (
    <section>
      <h2>{teamName}</h2>
      {players.length === 0 ? (
        <p>{t('admin.boxScore.noPlayers')}</p>
      ) : (
        <div className="box-score-grid" role="region" aria-label={teamName} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('admin.boxScore.player')}</th>
                <th scope="col">{t('admin.boxScore.played')}</th>
                {sheet.minutes ? (
                  <th scope="col">
                    <abbr title={t('admin.boxScore.minutes')}>
                      {t('admin.boxScore.minutes.short')}
                    </abbr>
                  </th>
                ) : null}
                {columns.map(({ key, label }) => (
                  <th scope="col" key={key}>
                    <abbr title={label.full}>{label.short}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const line = lineOf.get(player.personId);
                const name = nameOf(player);
                const minutes =
                  line?.secondsPlayed === null || line?.secondsPlayed === undefined
                    ? ''
                    : String(Math.round(line.secondsPlayed / 60));
                return (
                  <tr key={player.personId}>
                    <th scope="row">
                      {player.jerseyNumber === null || !hasName(player)
                        ? null
                        : `${t('admin.boxScore.jersey', { number: player.jerseyNumber })} `}
                      {name}
                      {player.left ? ` ${t('admin.boxScore.left')}` : null}
                    </th>
                    <td>
                      <input
                        type="checkbox"
                        name={boxScoreField.played(player.personId)}
                        defaultChecked={line?.played === true}
                        disabled={!editable}
                        aria-label={t('admin.boxScore.playedBy', { name })}
                      />
                    </td>
                    {sheet.minutes ? (
                      <td>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={1440}
                          step={1}
                          name={boxScoreField.minutes(player.personId)}
                          defaultValue={minutes}
                          disabled={!editable}
                          aria-label={t('admin.boxScore.cellLabel', {
                            stat: t('admin.boxScore.minutes'),
                            name,
                          })}
                        />
                      </td>
                    ) : null}
                    {columns.map(({ key, label }) => (
                      <td key={key}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={999}
                          step={1}
                          name={boxScoreField.stat(player.personId, key)}
                          defaultValue={savedText(line, key)}
                          disabled={!editable}
                          aria-label={t('admin.boxScore.cellLabel', { stat: label.full, name })}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export async function BoxScorePage({
  league,
  gameId,
  search,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  /** The route's game value: the game's id. */
  readonly gameId: string;
  readonly search: SearchParams;
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
  const notice = boxScoreNotice(search);
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
  const teams = [
    { teamId: game.awayTeamId, name: awayName, score: game.awayScore, field: 'awayScore' },
    { teamId: game.homeTeamId, name: homeName, score: game.homeScore, field: 'homeScore' },
  ] as const;
  return (
    <main className="admin-games">
      <p>
        <a href={back}>{t('admin.boxScore.back')}</a>
      </p>
      <h1>{t('admin.boxScore.title', { away: awayName, home: homeName })}</h1>
      {notice === undefined ? null : (
        <p role={notice.problem ? 'alert' : 'status'}>{t(notice.key)}</p>
      )}
      {sheet.locked === null ? (
        <p>{t('admin.boxScore.help')}</p>
      ) : (
        <p>{t(`admin.boxScore.locked.${sheet.locked}`)}</p>
      )}
      {reopen.kind === 'correct' ? (
        <form action={reopenBoxScoreAction} className="ui-stack">
          <input type="hidden" name="league" value={league} />
          <input type="hidden" name="gameId" value={game.id} />
          <input type="hidden" name="version" value={game.version} />
          <input type="hidden" name="door" value={reopen.door} />
          {reopen.door === 'tracked' ? (
            // Made once as the form is drawn: a second send of it is the same reopen.
            <input type="hidden" name="requestId" value={crypto.randomUUID()} />
          ) : null}
          {/* A game not entered as a box score is put right on the games list, beside it. */}
          {game.captureMode === 'box' ? null : <input type="hidden" name="then" value="games" />}
          {reopen.until === null ? null : (
            <p>
              {t('admin.games.reopenUntil', {
                time: clockTimeText(reopen.until, { locale, timeZone }),
              })}
            </p>
          )}
          <label className="ui-stack">
            <span>{t('admin.boxScore.reopenReason')}</span>
            <input type="text" name="reason" required maxLength={1000} autoComplete="off" />
          </label>
          <p>
            <button type="submit" className="ui-button" data-kind="main">
              {t('admin.boxScore.reopen')}
            </button>
          </p>
        </form>
      ) : reopen.kind === 'who' ? (
        <p data-reopen="who">{t(`admin.games.reopenWho.${reopen.because}`)}</p>
      ) : null}
      <form action={saveBoxScoreAction}>
        <input type="hidden" name="league" value={league} />
        <input type="hidden" name="gameId" value={game.id} />
        <input type="hidden" name="version" value={game.version} />
        {teams.map((team) => (
          <TeamGrid
            key={team.teamId}
            sheet={sheet}
            teamName={team.name}
            players={sheet.players.filter((p) => p.teamId === team.teamId)}
            editable={editable}
          />
        ))}
        <fieldset>
          {teams.map((team) => (
            <label key={team.field}>
              <span>{t('admin.games.scoreOf', { team: team.name })}</span>
              <input
                type="number"
                name={team.field}
                inputMode="numeric"
                min={0}
                max={999}
                step={1}
                defaultValue={team.score === null ? '' : String(team.score)}
                disabled={!editable}
              />
            </label>
          ))}
          {editable ? <p>{t('admin.boxScore.scoreHelp')}</p> : null}
          {editable && sheet.statKeys.includes('points') ? (
            <ScoreCheck
              teams={teams.map((team) => ({
                scoreField: team.field,
                personIds: sheet.players
                  .filter((p) => p.teamId === team.teamId)
                  .map((p) => p.personId),
                warning: t('admin.boxScore.scoreMismatch', {
                  team: team.name,
                  score: '{score}',
                  points: '{points}',
                }),
              }))}
            />
          ) : null}
        </fieldset>
        {editable ? <button type="submit">{t('admin.boxScore.save')}</button> : null}
      </form>
    </main>
  );
}
