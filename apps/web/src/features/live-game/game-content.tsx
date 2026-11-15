// The content of a game's page (step 2.45), drawn from what game-page.tsx worked out on
// the server. Nothing here reads anything, so tests can draw it from made-up games.
// Its look (step 2.85) is the shared pieces': the page head, the scoreboard, sections
// with their rule, tables in their frame two across on a laptop, and calm panels where
// there is nothing to list.
import type { GameSnapshot } from '@srleagues/contracts';
import { BoxScoreTable, EmptyPanel, PlayTable } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { t } from '../../server/messages.ts';
import {
  boardStateText,
  gameWords,
  liveGameLabels,
  statusNote,
  type BoxScoresView,
  type GameBoard,
  type PlayPeriodView,
} from './build-game.ts';
import { webLiveAddress } from '../live-updates/index.ts';
import { LiveGameView } from './live-game-view.tsx';
import { NewerPlaysLink } from './newer-plays-link.tsx';

export type GameView = {
  readonly leagueId: string;
  readonly title: string;
  /** The game's own status: the snapshot calls a postponed or cancelled game "scheduled". */
  readonly status: string;
  /** Null: a postponed or cancelled game with no date. */
  readonly start: string | null;
  readonly corrected: string | null;
  readonly snapshot: GameSnapshot;
  readonly snapshotAddress: string;
  /** This page's own address, to show newer plays. */
  readonly selfAddress: string;
  readonly boxScores: BoxScoresView | null;
  /** The play-by-play, newest first, a period at a time. */
  readonly plays: readonly PlayPeriodView[];
  /** The way back: the league's schedule. */
  readonly scheduleAddress?: string | undefined;
  /** "Game 8", for a game the schedule numbers. */
  readonly numberText?: string | undefined;
  /** The teams' colors, and when and where the game is played. */
  readonly board?: GameBoard | undefined;
};

/** The play-by-play's own id: "Show newer plays" lands on it, not on the top of the page. */
const playsId = 'game-plays';

/** The page's content, drawn from what the server worked out. Nothing here reads anything. */
export function GameContent({ view }: { readonly view: GameView }) {
  const labels = displayLabels(t);
  const arrivedFinal = view.snapshot.status === 'final';
  const playLabels = {
    time: t('game.col.time'),
    play: t('game.col.play'),
    score: t('game.col.score'),
  };
  return (
    <main className="game-page">
      {view.scheduleAddress === undefined ? null : (
        <nav className="ui-crumbs">
          <a href={view.scheduleAddress}>{t('game.back')}</a>
        </nav>
      )}
      <header className="ui-page-head">
        {view.numberText === undefined ? null : <p className="ui-eyebrow">{view.numberText}</p>}
        <h1 dir="auto">{view.title}</h1>
        {view.start === null ? null : <p className="ui-page-sub">{view.start}</p>}
        {view.corrected === null ? null : (
          <p className="ui-page-sub game-corrected">{view.corrected}</p>
        )}
      </header>
      <LiveGameView
        leagueId={view.leagueId}
        gameId={view.snapshot.gameId}
        snapshotAddress={view.snapshotAddress}
        liveAddress={webLiveAddress}
        initial={view.snapshot}
        showPlayers={!arrivedFinal}
        words={gameWords()}
        labels={liveGameLabels(view.status)}
        board={{
          ...view.board,
          stateText: boardStateText(view.status),
          noteText: statusNote(view.status) ?? undefined,
        }}
      />
      {view.boxScores === null ? null : (
        <section className="ui-section" aria-labelledby="game-box-scores">
          <div className="ui-section-head">
            <h2 id="game-box-scores">{t('game.boxScores')}</h2>
          </div>
          {view.boxScores.kind === 'final-score-only' ? (
            <EmptyPanel text={t('game.finalScoreOnly')} />
          ) : view.boxScores.kind === 'no-stats' ? (
            <EmptyPanel text={t('game.noStats')} />
          ) : (
            <div className="game-tables">
              {view.boxScores.tables.map((table) => (
                <BoxScoreTable
                  key={table.side}
                  teamName={table.teamName}
                  columns={table.columns}
                  players={table.players}
                  totals={table.totals}
                  hiddenNotice={t('game.playersHidden')}
                  labels={labels.boxScore}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {/* No plays and none to come: a game not started, or decided with only its final
          score or box score kept, has no play-by-play section at all. */}
      {view.snapshot.status !== 'live' && view.plays.length === 0 ? null : (
        <section className="ui-section" aria-labelledby={playsId}>
          <div className="ui-section-head">
            <h2 id={playsId}>{t('game.plays')}</h2>
          </div>
          {view.snapshot.status === 'live' ? (
            <p className="ui-section-note">
              {t('game.playsAsOpened')}{' '}
              <NewerPlaysLink href={`${view.selfAddress}#${playsId}`}>
                {t('game.newerPlays')}
              </NewerPlaysLink>
            </p>
          ) : null}
          {view.plays.length === 0 ? (
            <EmptyPanel text={t('game.noPlays')} />
          ) : (
            <div className="game-tables">
              {view.plays.map((period) => (
                <PlayTable
                  key={period.key}
                  title={period.title}
                  rows={period.rows}
                  labels={playLabels}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
