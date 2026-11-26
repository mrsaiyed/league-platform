// `/{league}/admin/games/{game}/edit`: the "edit box score" grid of a live-tracked game
// (step 2.65, T6 §8, T-122, T-405). Reached from the game's own page only when the game was
// scored with the tracker and is reopened with a reason; otherwise this page says what to
// do first, with the way back to the game's page, where its reopen form is. Each change is
// saved as a play (games.correct_tracked_box_score), so the game's list of plays still
// explains the numbers, and after a save the page says, once, in plain sentences, the
// plays that were added. The baskets only go up: taking points away is the scoring
// screen's Undo, and the page says so, with the way there. Words from the message files.
import {
  getBoxScoreSheet,
  leagueUrl,
  readTrackedBoxScore,
  type GameRosterPlayer,
  type TrackedGridRow,
} from '@srleagues/core';
import { PageHead } from '@srleagues/ui';
import { notFound } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { scoringNameText } from '../../server/scoring-name-text.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { StaffTrail } from '../staff/index.ts';
import { statLabel } from '../stats-pages/index.ts';
import { hasName, rosterName } from '../teams-area/index.ts';
import { correctTrackedGridAction, endTrackedGameAgainAction } from './actions.ts';
import { EndAgainForm } from './end-again-form.tsx';
import { SaidLine } from '../list-forms/said-line.tsx';
import { playSentences, trackedGridColumns, trackedGridField } from './tracked-grid.ts';
import { TrackedGridForm, type TrackedGridTeam } from './tracked-grid-form.tsx';

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "#4 Ada Lionel", or "#12" for a player added at the scorer's table by number only. */
function headingOf(row: TrackedGridRow, listed: GameRosterPlayer | undefined): string {
  // The scoring screens' rule names the player (R-33); a place is worded in (T-483).
  const player = listed === undefined ? undefined : { ...listed, ...scoringNameText(listed) };
  if (player === undefined) {
    return row.jerseyNumber === null
      ? ''
      : t('admin.boxScore.jersey', { number: row.jerseyNumber });
  }
  const jersey =
    player.jerseyNumber === null || !hasName(player)
      ? ''
      : `${t('admin.boxScore.jersey', { number: player.jerseyNumber })} `;
  return `${jersey}${rosterName(player)}`;
}

export async function TrackedGridPage({
  league,
  gameId,
}: {
  readonly league: string;
  readonly gameId: string;
}) {
  const view = await loadLeaguePage(league, 'admin', 'games');
  const here = view.context.league;
  if (!uuidShape.test(gameId)) return notFound();
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const id = gameId.toLowerCase();
  const sheetRead = await getBoxScoreSheet(context, { gameId: id }, ports.games.deps);
  // A game this person may not correct, or one not scored with the tracker, has no such
  // grid: "Page not found", as for the game's own page (step 2.157).
  const read = sheetRead.ok
    ? await readTrackedBoxScore(context, { gameId: id }, ports.games.deps)
    : undefined;
  if (!sheetRead.ok || read === undefined || !read.ok) return notFound();
  const sheet = sheetRead.value;
  const grid = read.value;
  const { game } = sheet;
  const names = (await ports.games.namesOf(here.id)).teams;
  const homeName = names[game.homeTeamId] ?? '';
  const awayName = names[game.awayTeamId] ?? '';
  const gameHref = leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id] });
  const editHref = leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id, 'edit'] });
  const title = t('admin.boxScore.tracked.title', { away: awayName, home: homeName });
  const trail = (
    <StaffTrail
      steps={[
        { href: leagueUrl(here, 'admin-area', { area: 'games' }), label: t('admin.area.games') },
        { href: gameHref, label: t('admin.games.game', { away: awayName, home: homeName }) },
      ]}
      here={t('admin.boxScore.tracked.edit')}
    />
  );
  if (!grid.correctable) {
    return (
      <main className="admin-games admin-sheet">
        {trail}
        <PageHead title={title} />
        <div className="staff-panel ui-stack">
          <p data-grid-closed={grid.notCorrectable}>
            {t(`admin.boxScore.tracked.notCorrectable.${grid.notCorrectable ?? 'game-not-live'}`)}
          </p>
          <p>
            <a className="ui-more" href={gameHref}>
              {t('admin.games.game', { away: awayName, home: homeName })}
            </a>
          </p>
        </div>
      </main>
    );
  }
  // What the last save here added, taken once (a reload does not say it again).
  const holder = noticeHolderOf(context);
  const notice = holder === undefined ? undefined : savedNoticesHere().take(holder, 'tracked-grid');
  const mine = notice?.thing === game.id ? notice : undefined;
  const playerOf = new Map(sheet.players.map((player) => [player.personId, player]));
  const rowOf = new Map(grid.lines.map((row) => [row.personId, row]));
  const nameOf = (personId: string) => {
    const row = rowOf.get(personId);
    return row === undefined ? '' : headingOf(row, playerOf.get(personId));
  };
  const said =
    mine === undefined
      ? undefined
      : playSentences(mine.about ?? []).map((s) =>
          t(s.key, { name: nameOf(s.personId), period: s.period ?? '' }),
        );
  const columns = trackedGridColumns(sheet.statKeys);
  const teams: readonly TrackedGridTeam[] = [
    { teamId: game.awayTeamId, name: awayName },
    { teamId: game.homeTeamId, name: homeName },
  ].map((side) => ({
    ...side,
    rows: grid.lines
      .filter((row) => row.teamId === side.teamId)
      .map((row) => {
        const heading = nameOf(row.personId);
        return {
          personId: row.personId,
          heading,
          minutes: String(Math.round(row.secondsPlayed / 60)),
          points: String(row.points),
          boxes: columns.map((stat) => ({
            field: trackedGridField(row.personId, stat),
            label: t('admin.boxScore.cellLabel', { stat: statLabel(stat).full, name: heading }),
            saved: String(row[stat]),
          })),
        };
      }),
  }));
  const label = (key: string) => ({ short: statLabel(key).short, full: statLabel(key).full });
  return (
    <main className="admin-games admin-sheet">
      {trail}
      <PageHead title={title} sub={t('admin.boxScore.tracked.help')} />
      {said === undefined ? null : (
        <div className="staff-panel" data-grid-saved="">
          <SaidLine kind="saved">
            {said.length === 0
              ? t('admin.boxScore.tracked.noChange')
              : t('admin.boxScore.tracked.saved')}
          </SaidLine>
          {said.length === 0 ? null : (
            <ul>
              {said.map((sentence, index) => (
                <li key={index}>{sentence}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="ui-notice" data-grid-lower="">
        {t('admin.boxScore.tracked.lower')}{' '}
        <a className="ui-more" href={leagueUrl(here, 'score', { game: game.id })}>
          {t('admin.boxScore.tracked.lowerLink')}
        </a>
      </p>
      <TrackedGridForm
        action={correctTrackedGridAction}
        permalink={editHref}
        hidden={{
          league,
          gameId: game.id,
          sequence: String(grid.sequence),
          requestToken: crypto.randomUUID(),
        }}
        teams={teams}
        texts={{
          player: t('admin.boxScore.player'),
          minutes: { short: t('admin.boxScore.minutes.short'), full: t('admin.boxScore.minutes') },
          points: label('points'),
          columns: columns.map(label),
          noPlayers: t('admin.boxScore.noPlayers'),
          save: t('admin.boxScore.tracked.save'),
          reload: t('admin.boxScore.tracked.reload'),
        }}
      />
      <div className="staff-panel">
        <EndAgainForm
          action={endTrackedGameAgainAction}
          permalink={editHref}
          hidden={{
            league,
            gameId: game.id,
            sequence: String(grid.sequence),
            requestToken: crypto.randomUUID(),
          }}
          texts={{
            help: t('admin.boxScore.tracked.endAgainHelp'),
            button: t('admin.boxScore.tracked.endAgain'),
            reload: t('admin.boxScore.tracked.reload'),
          }}
        />
      </div>
    </main>
  );
}
