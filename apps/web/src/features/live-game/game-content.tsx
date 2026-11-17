// The content of a game's page (step 2.45), drawn from what game-page.tsx worked out on
// the server. Nothing here reads anything, so tests can draw it from made-up games.
// Its look (step 2.85) is the shared pieces': the page head, the scoreboard, sections
// with their rule, tables in their frame two across on a laptop, and calm panels where
// there is nothing to list.
import type { GameSnapshot } from '@srleagues/contracts';
import {
  BoxScoreTable,
  EmptyPanel,
  lettersWide,
  PlayTable,
  Section,
  TeamCard,
} from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { t } from '../../server/messages.ts';
import {
  boardStateText,
  forfeitNote,
  gameWords,
  liveGameLabels,
  statusNote,
  type BoxScoresView,
  type GameBoard,
  type PlayPeriodView,
} from './build-game.ts';
import { webLiveAddress } from '../live-updates/index.ts';
import { GameOffer, scoringAddressOf } from '../schedule-pages/index.ts';
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
  /**
   * The two teams with their records, away team first, for the foot of the page of a game
   * still to come or put off: such a page has no box score and no plays to end with.
   */
  readonly teams?: readonly GameTeamCard[] | undefined;
};

/** A team as the foot of a game's page draws it: the same facts as on the teams page. */
export type GameTeamCard = {
  readonly slug: string;
  readonly name: string;
  readonly color: string | null;
  readonly href: string;
  readonly seedText: string;
  readonly recordText: string;
  readonly divisionName: string | null;
};

/** The play-by-play's own id: "Show newer plays" lands on it, not on the top of the page. */
const playsId = 'game-plays';

/** The page's content, drawn from what the server worked out. Nothing here reads anything. */
export function GameContent({ view }: { readonly view: GameView }) {
  const labels = displayLabels(t);
  const arrivedFinal = view.snapshot.status === 'final';
  const pending = ['scheduled', 'postponed', 'cancelled'].includes(view.status);
  const playLabels = {
    time: t('game.col.time'),
    play: t('game.col.play'),
    score: t('game.col.score'),
  };
  // The two box scores give their names the same room: the longest name of either team.
  const nameRoom =
    view.boxScores?.kind === 'tables'
      ? Math.max(
          0,
          ...view.boxScores.tables.flatMap((table) =>
            (table.players ?? []).map((player) => lettersWide(player.name)),
          ),
        )
      : 0;
  return (
    <main className="game-page">
      {view.scheduleAddress === undefined ? null : (
        <nav className="ui-crumbs">
          <a href={view.scheduleAddress}>{t('game.back')}</a>
        </nav>
      )}
      <header className="ui-page-head">
        {view.numberText === undefined ? null : <p className="ui-kicker">{view.numberText}</p>}
        {/* The board under this head says the two names at title size, so the title is
            kept for screen readers and the browser's tab and not drawn. */}
        <h1 className="ui-visually-hidden" dir="auto">
          {view.title}
        </h1>
        {view.start === null ? null : <p className="ui-page-sub">{view.start}</p>}
        {view.corrected === null ? null : (
          <p className="ui-page-sub game-corrected">{view.corrected}</p>
        )}
        {/* "Score this game" or "Enter the score", drawn on the device of a signed-in person
            who may, after the page; the page itself is the same for everyone (step 2.153). */}
        <GameOffer
          address={scoringAddressOf(view.leagueId)}
          gameId={view.snapshot.gameId}
          status={view.status}
        />
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
          noteText:
            view.status === 'forfeit'
              ? forfeitNote(
                  { name: view.snapshot.teams.away.name, score: view.snapshot.score.away },
                  { name: view.snapshot.teams.home.name, score: view.snapshot.score.home },
                )
              : (statusNote(view.status) ?? undefined),
        }}
      />
      {/* A game still to come, or put off, has no box score and no plays: its page ends with
          the two teams, each with its record and the way to its own page, and the way back
          to the whole schedule. */}
      {pending && view.teams !== undefined && view.teams.length > 0 ? (
        <Section
          title={t('game.teams')}
          more={
            view.scheduleAddress === undefined
              ? undefined
              : { href: view.scheduleAddress, label: t('home.fullSchedule') }
          }
        >
          {/* As on the teams page: upright and side by side from a tablet up, away team
              first as on the board above; one row each on a phone. */}
          <ul className="ui-card-grid" data-layout="teams">
            {view.teams.map((team) => (
              <li key={team.slug}>
                <TeamCard
                  name={team.name}
                  href={team.href}
                  color={team.color}
                  level={3}
                  way={t('team.roster')}
                  figure={{ label: t('teams.col.record'), value: team.recordText }}
                  facts={[
                    { key: 'seed', label: t('teams.col.seed'), value: team.seedText },
                    ...(team.divisionName === null
                      ? []
                      : [
                          {
                            key: 'division',
                            label: t('teams.col.division'),
                            value: team.divisionName,
                          },
                        ]),
                  ]}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
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
                  nameRoom={nameRoom}
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
            {/* The way to newer plays stands beside the title, drawn as every way on is (in
                the color the eye lands on, with its arrow), not as a link inside a sentence. */}
            {view.snapshot.status === 'live' ? (
              <NewerPlaysLink className="ui-more" href={`${view.selfAddress}#${playsId}`}>
                {t('game.newerPlays')}
              </NewerPlaysLink>
            ) : null}
          </div>
          {view.snapshot.status === 'live' ? (
            <p className="ui-section-note">{t('game.playsAsOpened')}</p>
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
