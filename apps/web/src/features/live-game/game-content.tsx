// The content of a game's page (step 2.45), drawn from what game-page.tsx worked out on
// the server. Nothing here reads anything, so tests can draw it from made-up games.
import type { GameSnapshot } from '@srleagues/contracts';
import { BoxScoreTable } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { t } from '../../server/messages.ts';
import { gameWords, liveGameLabels, statusNote, type BoxScoresView } from './build-game.ts';
import { LiveGameView } from './live-game-view.tsx';

/** The web app's own live address (T-14). */
const liveAddress = '/api/v1/live';

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
  readonly plays: readonly string[];
};

/** The page's content, drawn from what the server worked out. Nothing here reads anything. */
export function GameContent({ view }: { readonly view: GameView }) {
  const labels = displayLabels(t);
  const arrivedFinal = view.snapshot.status === 'final';
  const note = statusNote(view.status);
  return (
    <main>
      <h1 dir="auto">{view.title}</h1>
      {view.start === null ? null : <p>{view.start}</p>}
      {note === null ? null : <p className="game-status-note">{note}</p>}
      {view.corrected === null ? null : <p className="game-corrected">{view.corrected}</p>}
      <LiveGameView
        leagueId={view.leagueId}
        gameId={view.snapshot.gameId}
        snapshotAddress={view.snapshotAddress}
        liveAddress={liveAddress}
        initial={view.snapshot}
        showPlayers={!arrivedFinal}
        words={gameWords()}
        labels={liveGameLabels(view.status)}
      />
      {view.boxScores === null ? null : (
        <section aria-labelledby="game-box-scores">
          <h2 id="game-box-scores">{t('game.boxScores')}</h2>
          {view.boxScores.kind === 'final-score-only' ? (
            <p>{t('game.finalScoreOnly')}</p>
          ) : view.boxScores.kind === 'no-stats' ? (
            <p>{t('game.noStats')}</p>
          ) : (
            view.boxScores.tables.map((table) => (
              <BoxScoreTable
                key={table.side}
                teamName={table.teamName}
                columns={table.columns}
                players={table.players}
                totals={table.totals}
                hiddenNotice={t('game.playersHidden')}
                labels={labels.boxScore}
              />
            ))
          )}
        </section>
      )}
      {view.snapshot.status === 'scheduled' && view.plays.length === 0 ? null : (
        <section aria-labelledby="game-plays">
          <h2 id="game-plays">{t('game.plays')}</h2>
          {view.snapshot.status === 'live' ? (
            <p>
              {t('game.playsAsOpened')} <a href={view.selfAddress}>{t('game.newerPlays')}</a>
            </p>
          ) : null}
          {view.plays.length === 0 ? (
            <p>{t('game.noPlays')}</p>
          ) : (
            <ol reversed className="game-plays">
              {view.plays.map((line, i) => (
                <li key={view.plays.length - i}>{line}</li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
