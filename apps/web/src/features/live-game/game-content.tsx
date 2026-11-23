// The content of a game's page (step 2.45), drawn from what game-page.tsx worked out on
// the server. Nothing here reads anything, so tests can draw it from made-up games.
// Its look (step 2.85) is the shared pieces': the page head, the scoreboard, sections
// with their rule, tables in their frame two across on a laptop, and calm panels where
// there is nothing to list.
import type { GameSnapshot } from '@srleagues/contracts';
import { Section, TeamCard } from '@srleagues/ui';
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
import { GameCorrection, GameOffer, scoringAddressOf } from '../schedule-pages/index.ts';
import { LiveGameView } from './live-game-view.tsx';
import { GameNumbersDrawn } from './game-numbers-drawn.tsx';
import { gameNumbersView } from './game-numbers-view.ts';
import { StaffGameNumbers } from './staff-game-numbers.tsx';

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
  /**
   * Where the page asks, after it has arrived, for the numbers it leaves out (step 2.46):
   * only for a game whose box score or plays keep a team's players from the public.
   */
  readonly staffNumbersAddress?: string | undefined;
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

/** The page's content, drawn from what the server worked out. Nothing here reads anything. */
export function GameContent({ view }: { readonly view: GameView }) {
  const arrivedFinal = view.snapshot.status === 'final';
  const pending = ['scheduled', 'postponed', 'cancelled'].includes(view.status);
  const numbers = (
    <GameNumbersDrawn
      view={gameNumbersView({
        boxScores: view.boxScores,
        plays: view.plays,
        live: view.snapshot.status === 'live',
        selfAddress: view.selfAddress,
      })}
    />
  );
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
        {/* The public pencil (step 2.56, H5): "Correct this result" on a decided game, for
            whoever may reopen it, drawn the same way, after the page. */}
        <GameCorrection
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
      {view.staffNumbersAddress === undefined ? (
        numbers
      ) : (
        // Drawn again from the start when the page is drawn again as the game starts or ends
        // (record 051), so it asks again then.
        <StaffGameNumbers key={view.snapshot.status} address={view.staffNumbersAddress}>
          {numbers}
        </StaffGameNumbers>
      )}
    </main>
  );
}
