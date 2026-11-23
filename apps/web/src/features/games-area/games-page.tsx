// `/{league}/admin/games`: the games that still need a result, however old, then today,
// this week by day, and earlier games a round at a time (step 2.156), and the changes this
// person may make to each (steps 2.55, 2.154 and 2.155). Every form here is answered
// without the address (T-271, record 067): a refusal or the question before a final score
// is saved in the response to the post, beside the game (final-score-boxes.tsx,
// action-form.tsx); a save by the one-time notice, read here once, which names the game
// and is said beside it.
import {
  earlierRoundGamesLimit,
  earlierRoundsLimit,
  gameAnchor,
  getBoxScoreSheet,
  leagueUrl,
  listEarlierGames,
  listGamesNeedingResult,
  listMyGames,
  listPostponedGames,
  needsResultLimit,
  type CommandContext,
  type CommandDeps,
  type LeagueAddressee,
  type MyGame,
  type PostponedGame,
  type TrackerTx,
} from '@srleagues/core';
import { displayLabels, finalPillOf } from '@srleagues/site';
import { EmptyPanel, FilterToolbar, GameCard, PageHead, RoundPicker, Section } from '@srleagues/ui';
import { webPorts } from '../../server/container.ts';
import type { GameNames } from '../../server/games-area-ports.ts';
import { commandContextOf } from '../../server/context.ts';
import { gameWhenText, type LeagueTimes } from '../../server/game-when.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { noticeHolderOf, savedNoticesHere, type SavedNotice } from '../../server/saved-notice.ts';
import { ActionForm } from './action-form.tsx';
import { callOffAction, finalScoreAction, putBackAction } from './actions.ts';
import { buildGameRows, type GameRowView } from './build-games-view.ts';
import { CallOffForms } from './call-off-forms.tsx';
import { callOffTexts, putBackChoice, restoreTexts } from './call-off-texts.ts';
import { earlyWhen, nowOf } from './early-when.ts';
import { FinalScoreBoxes, type FinalScoreTexts } from './final-score-boxes.tsx';
import { earlierEmptyText, needsResultEmptyText } from './empty-list-text.ts';
import { dayHeadingText, earlierRoundText } from './game-day-text.ts';
import { gamesSections } from './games-sections.ts';
import { readReopenViews } from './read-reopen-views.ts';
import { ReopenLine } from './reopen-line.tsx';
import { SavedLine, type SavedKind } from './saved-line.tsx';
import { waitingListAnchor as waitingAnchor } from './waiting-anchor.ts';

/** What the words of a saved notice read of the game it names. */
type NamedGame = Pick<
  GameRowView,
  'homeName' | 'awayName' | 'homeScore' | 'awayScore' | 'hasPlays'
>;

/** "Tigers 47, Lions 51": both teams and the score, away team first, as on the card. */
function resultText(game: NamedGame, homeScore: number | string, awayScore: number | string) {
  return t('admin.games.result', {
    away: game.awayName,
    awayScore: String(awayScore),
    home: game.homeName,
    homeScore: String(homeScore),
  });
}

/** "Tigers at Lions". */
const gameText = (game: NamedGame) =>
  t('admin.games.game', { away: game.awayName, home: game.homeName });

const savedKeys = ['postpone', 'cancel', 'putBack', 'putBackDate', 'putBackPostponed'] as const;

/**
 * "Saved: Falcons forfeited Herons at Falcons. Herons win 20–0." (step 2.158): who
 * forfeited is the side the forfeit score left behind.
 */
function forfeitText(game: NamedGame): string | undefined {
  if (game.homeScore === null || game.awayScore === null) return undefined;
  const homeLost = game.homeScore < game.awayScore;
  return t('admin.games.saved.forfeit', {
    team: homeLost ? game.homeName : game.awayName,
    winner: homeLost ? game.awayName : game.homeName,
    game: gameText(game),
    winnerScore: String(Math.max(game.homeScore, game.awayScore)),
    loserScore: String(Math.min(game.homeScore, game.awayScore)),
  });
}

/**
 * What was just saved, as words, naming the game, read from the game as it is now: a
 * final score names its score too ("Saved: Tigers 47, Lions 51 is final."); a game put back
 * over games that took its place since names them at once (`others`, step 2.158).
 */
function noticeText(
  notice: SavedNotice,
  game: NamedGame | undefined,
  others: readonly string[] = [],
): string {
  const said = notice.said;
  const clash =
    others.length === 0 ? '' : ` ${t('admin.games.saved.clash', { others: others.join(', ') })}`;
  return savedWords(said, game) + clash;
}

/** A notice that says a change was not made: the game was called off meanwhile (step 2.221). */
const notDoneKeys: readonly TextKey[] = [
  'admin.games.error.game-now-cancelled',
  'admin.games.error.game-now-postponed',
];
const notDoneOf = (said: string) => notDoneKeys.find((k) => k === `admin.games.error.${said}`);

function savedWords(said: string, game: NamedGame | undefined): string {
  const notDone = notDoneOf(said);
  if (notDone !== undefined) return t(notDone);
  if (said === 'reopen') {
    return t(
      game?.hasPlays === true ? 'admin.games.done.reopenTracked' : 'admin.games.done.reopen',
    );
  }
  if (game === undefined) {
    const doneKeys: readonly TextKey[] = [
      'admin.games.done.final',
      'admin.games.done.forfeit',
      'admin.games.done.postpone',
      'admin.games.done.cancel',
      'admin.games.done.putBack',
      'admin.games.done.putBackDate',
      'admin.games.done.putBackPostponed',
    ];
    return t(doneKeys.find((k) => k === `admin.games.done.${said}`) ?? 'admin.games.done.final');
  }
  if (said === 'final' && game.homeScore !== null && game.awayScore !== null) {
    return t('admin.games.saved.final', {
      result: resultText(game, game.homeScore, game.awayScore),
    });
  }
  if (said === 'forfeit') return forfeitText(game) ?? t('admin.games.done.forfeit');
  const kind = savedKeys.find((k) => k === said);
  return kind === undefined
    ? t('admin.games.done.final')
    : t(`admin.games.saved.${kind}`, { game: gameText(game) });
}

/** The words of a game's score boxes and its question, for the client form. */
function finalScoreTexts(game: GameRowView, early: string | undefined): FinalScoreTexts {
  const result = resultText(game, '{homeScore}', '{awayScore}');
  const team = { awayScore: game.awayName, homeScore: game.homeName } as const;
  return {
    enterFinal: t('admin.games.enterFinal'),
    save: t('admin.games.saveScore'),
    labels: {
      awayScore: t('admin.games.scoreOf', { team: team.awayScore }),
      homeScore: t('admin.games.scoreOf', { team: team.homeScore }),
    },
    ask:
      early === undefined
        ? t('admin.games.confirm.ask', { result })
        : t('admin.games.confirm.early', { result, when: early }),
    yes: t('admin.games.confirm.yes'),
    no: t('admin.games.confirm.no'),
    wrongBox: {
      awayScore: t('admin.games.refused.score', { team: team.awayScore }),
      homeScore: t('admin.games.refused.score', { team: team.homeScore }),
    },
    tie: t('admin.games.refused.tie', { result }),
  };
}

/** A game's form's hidden values: which game as it was read, and the form's one-time token. */
function hiddenOf(league: string, game: GameRowView): Record<string, string> {
  return {
    league,
    gameId: game.id,
    version: String(game.version),
    requestToken: crypto.randomUUID(),
  };
}

function Controls({
  league,
  here,
  game,
  reopened,
  times,
  now,
  round,
  waitingHref,
}: {
  readonly league: string;
  readonly here: LeagueAddressee;
  readonly game: GameRowView;
  /** "Waiting for a new date" on this page, when it is shown to this person. */
  readonly waitingHref: string | undefined;
  /** The game was just reopened to correct it: its boxes start open. */
  readonly reopened: boolean;
  readonly times: LeagueTimes;
  /** The ports' clock now (ms, nowOf), to say when a game's time has not come. */
  readonly now: number;
  /** The earlier round the game is shown in, kept in its place's address. */
  readonly round: string | undefined;
}) {
  const trackerHref = leagueUrl(here, 'score', { game: game.id });
  const gameHref = leagueUrl(here, 'admin-area', { area: 'games', subpath: [game.id] });
  const list = leagueUrl(here, 'admin-area', {
    area: 'games',
    query: round === undefined ? undefined : { round },
  });
  const permalink = `${list}#${gameAnchor(game.id)}`;
  // A refusal names the game ("Tigers at Lions: …").
  const refusal = t('admin.games.refusedAbout', { game: gameText(game), problem: '{problem}' });
  const early = earlyWhen(game.startsAt, now, times);
  // A game whose start has passed with no result: entering its score is the thing to do.
  const overdue =
    game.status === 'scheduled' && game.startsAt !== null && Date.parse(game.startsAt) <= now;
  return (
    <div className="admin-game-controls">
      {game.hasPlays ? (
        // Ended in the tracker (S-46): no score boxes and no forfeit.
        <>
          <p>{t('admin.games.tracked')}</p>
          {game.trackerLink ? (
            <p>
              <a className="ui-button" data-kind="main" href={trackerHref}>
                {t('admin.games.scoreGame')}
              </a>
            </p>
          ) : null}
        </>
      ) : null}
      {game.canScore ? (
        <FinalScoreBoxes
          action={finalScoreAction}
          league={league}
          gameId={game.id}
          version={game.version}
          token={crypto.randomUUID()}
          open={reopened}
          main={overdue}
          permalink={permalink}
          texts={finalScoreTexts(game, early)}
        />
      ) : null}
      {game.trackerLink && !game.hasPlays ? (
        <p>
          <a className="ui-button" href={trackerHref}>
            {t('admin.games.openTracker')}
          </a>
        </p>
      ) : null}
      {game.boxScoreLink ? (
        <p>
          <a className="ui-button" href={gameHref}>
            {t('admin.games.boxScore')}
          </a>
        </p>
      ) : null}
      <ReopenLine view={game.reopen} href={gameHref} times={times} />
      {game.status === 'postponed' ? (
        // Where it waits for its new date (step 2.158): the list on this page, when shown.
        <>
          <p>{t('admin.games.postponedWaits')}</p>
          {waitingHref === undefined ? null : (
            <p>
              <a className="ui-more" href={waitingHref}>
                {t('admin.games.waiting.link')}
              </a>
            </p>
          )}
        </>
      ) : null}
      {game.canRestore ? (
        // A postponement made by mistake, put back on its old date (S-75): asks first.
        <CallOffForms
          action={callOffAction}
          permalink={permalink}
          hidden={hiddenOf(league, game)}
          summaryButton
          texts={restoreTexts(game, gameWhenText(game.startsAt, times))}
        />
      ) : null}
      {game.canForfeit || game.canPostpone || game.canCancel ? (
        <CallOffForms
          action={callOffAction}
          permalink={permalink}
          hidden={hiddenOf(league, game)}
          texts={callOffTexts(game, {
            forfeit: game.canForfeit,
            postpone: game.canPostpone,
            cancel: game.canCancel,
          })}
        />
      ) : null}
      {game.canPutBack ? (
        <ActionForm
          action={putBackAction}
          permalink={permalink}
          hidden={hiddenOf(league, game)}
          summary={t('admin.games.putBack')}
          choice={putBackChoice()}
          button={t('admin.games.putBack.save')}
          refusal={refusal}
        />
      ) : null}
    </div>
  );
}

/** What every game on the page is drawn with. */
type ListScene = {
  readonly league: string;
  readonly here: LeagueAddressee;
  readonly times: LeagueTimes;
  readonly now: number;
  readonly labels: ReturnType<typeof displayLabels>['game'];
  /** The game a notice is about, and its words, when it is on the page. */
  readonly saved:
    | { readonly row: GameRowView; readonly text: string; readonly kind: SavedKind }
    | undefined;
  readonly reopenedId: string | undefined;
  /** "Waiting for a new date" on this page, when it is shown to this person. */
  readonly waitingHref: string | undefined;
};

/** One list of games, each with who scores it and what this person may do to it. */
function GameList({
  rows,
  scene,
  round,
}: {
  readonly rows: readonly GameRowView[];
  readonly scene: ListScene;
  /** The earlier round these are shown in, if they are. */
  readonly round?: string;
}) {
  const { here, times, now, labels, saved } = scene;
  return (
    <ul className="admin-game-list ui-list">
      {rows.map((game) => (
        <li key={game.id} id={gameAnchor(game.id)} className="admin-game">
          {saved !== undefined && game === saved.row ? (
            <SavedLine text={saved.text} kind={saved.kind} />
          ) : null}
          {/* One panel a game: its card, then who scores it and what may be done to it. */}
          <div className="admin-game-panel">
            <GameCard
              marks="emblem"
              home={{ name: game.homeName, score: game.homeScore }}
              away={{ name: game.awayName, score: game.awayScore }}
              status={game.status}
              finalPill={finalPillOf(t, game.overtimePeriods)}
              whenText={gameWhenText(game.startsAt, times)}
              {...(game.status === 'scheduled' &&
              game.startsAt !== null &&
              Date.parse(game.startsAt) <= now
                ? { note: t('schedule.awaitingResult') }
                : {})}
              {...(game.status === 'final' || game.status === 'forfeit'
                ? { detailsHref: leagueUrl(here, 'game', { game: game.id }) }
                : {})}
              labels={labels}
            />
            <p className="admin-game-who">
              {game.scorekeepers.length === 0
                ? t('admin.games.noScorekeeper')
                : t('admin.games.scorekeeper', { names: game.scorekeepers.join(', ') })}
            </p>
            <Controls
              league={scene.league}
              here={here}
              game={game}
              reopened={game.id === scene.reopenedId}
              times={times}
              now={now}
              round={round}
              waitingHref={scene.waitingHref}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One of the page's parts: its games, or a calm line when it has none. */
function Part({
  rows,
  empty,
  scene,
}: {
  readonly rows: readonly GameRowView[];
  readonly empty: string;
  readonly scene: ListScene;
}) {
  return rows.length === 0 ? <EmptyPanel text={empty} /> : <GameList rows={rows} scene={scene} />;
}

/**
 * "Waiting for a new date" (step 2.158): every postponed game, soonest first, as its card
 * (the Postponed pill and the date it was to be played). Cancelling it is offered on its
 * card where it is listed by its day or its earlier round; giving it a new date from here
 * is step 2.53's, and the part's note says it is not ready yet.
 */
function WaitingList({
  games,
  scene,
  names,
}: {
  readonly games: readonly PostponedGame[];
  readonly scene: ListScene;
  readonly names: GameNames;
}) {
  if (games.length === 0) return <EmptyPanel text={t('admin.games.waiting.empty')} />;
  return (
    <ul className="admin-game-list ui-list" data-waiting-list="">
      {games.map((game) => (
        <li key={game.id} className="admin-game" data-waiting-game={game.id}>
          <div className="admin-game-panel">
            <GameCard
              marks="emblem"
              home={{ name: names.teams[game.homeTeamId] ?? '', score: null }}
              away={{ name: names.teams[game.awayTeamId] ?? '', score: null }}
              status="postponed"
              whenText={gameWhenText(game.startsAt, scene.times)}
              labels={scene.labels}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * `/{league}/admin/games` (steps 2.55 and 2.156): the games that still need a result, however
 * old, then today, this week by day, and earlier games a round at a time, and the changes
 * this person may make to each. `round` is the earlier round asked for in the address
 * (navigation only, never a form's answer: record 067).
 */
export async function GamesPage({
  league,
  round,
}: {
  /** The route's `[league]` value. */
  readonly league: string;
  readonly round: string | undefined;
}) {
  const view = await loadLeaguePage(league, 'admin', 'games');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  // Which games are listed is the commands' own rule: a scorekeeper in a league that
  // scores assigned games only gets only theirs (P4 §4).
  const needs = await listGamesNeedingResult(context, {}, ports.games.deps);
  const listed = await listMyGames(context, {}, ports.games.deps);
  const earlier = await listEarlierGames(
    context,
    round === undefined ? {} : { round },
    ports.games.deps,
  );
  // Every postponed game, until it gets a new date (P7 §4 "Also", step 2.158): for whoever
  // may read the schedule (the command's own rule); for anyone else the part is not drawn.
  const postponed = await listPostponedGames(context, {}, ports.games.deps);
  const ok = needs.ok && listed.ok && earlier.ok;
  const today = listed.ok ? listed.value.today : '';
  const sections = gamesSections(
    needs.ok ? needs.value.games : [],
    listed.ok ? listed.value.games : [],
    today,
  );
  const shownRound = earlier.ok ? earlier.value.shown : null;
  const games = [
    ...sections.needsResult,
    ...sections.today,
    ...sections.days.flatMap((d) => d.games),
    ...(shownRound?.games ?? []),
  ];
  const holder = await ports.accessOf(context);
  const reopens = await readReopenViews(games, context, holder, ports.games.deps);
  const names = await ports.games.namesOf(addressee.id);
  const rowsOf = (of: readonly MyGame[]) => buildGameRows(of, names, holder, reopens);
  // The ports' one clock (step 2.179): the made-up world's own on the stand-in, so a game's
  // time is never measured against another clock than the one it was read on.
  const clock = await ports.publicSchedule.clockOf(addressee.id);
  const times: LeagueTimes = { locale, timeZone: clock.timeZone };
  // What was just saved, taken (so a reload does not say it again): said beside its game;
  // at the top when the game is not on the page (a result entered under "Needs a result"
  // takes the game to its earlier round), naming it from the game as it is now.
  const noticeHolder = noticeHolderOf(context);
  const notice =
    noticeHolder === undefined ? undefined : savedNoticesHere().take(noticeHolder, 'games');
  const aboutRow = rowsOf(games.filter((g) => g.id === notice?.thing))[0];
  const offPage =
    notice === undefined || aboutRow !== undefined
      ? undefined
      : await gameNamedOff(notice.thing, context, names, ports.games.deps);
  // The games a game put back now shares its place with, named from their records.
  const others: string[] = [];
  for (const other of notice?.about ?? []) {
    const named = await gameNamedOff(other, context, names, ports.games.deps);
    if (named !== undefined) others.push(gameText(named));
  }
  const saved = notice === undefined ? undefined : noticeText(notice, aboutRow ?? offPage, others);
  const savedKind: SavedKind =
    notice !== undefined && notDoneOf(notice.said) !== undefined ? 'error' : 'saved';
  const scene: ListScene = {
    league,
    here: addressee,
    times,
    now: nowOf(clock),
    labels: displayLabels(t).game,
    saved:
      aboutRow === undefined || saved === undefined
        ? undefined
        : { row: aboutRow, text: saved, kind: savedKind },
    reopenedId: notice?.said === 'reopen' ? notice.thing : undefined,
    waitingHref: postponed.ok
      ? `${leagueUrl(addressee, 'admin-area', { area: 'games' })}#${waitingAnchor}`
      : undefined,
  };
  // The same row object for a game wherever it is drawn, so its notice is beside it.
  const rows = (of: readonly MyGame[]) =>
    rowsOf(of).map((row) => (row.id === aboutRow?.id ? aboutRow : row));
  const earlierRounds = earlier.ok ? earlier.value.rounds : [];
  const severalSeasons = new Set(earlierRounds.map((r) => r.seasonId)).size > 1;
  const roundOptions = earlierRounds.map((r) => ({
    value: r.key,
    label: earlierRoundText(r, severalSeasons ? names.seasons[r.seasonId] : undefined, locale),
  }));
  const list = leagueUrl(addressee, 'admin-area', { area: 'games' });
  return (
    <main className="admin-games">
      <PageHead title={t('admin.area.games')} sub={t('admin.games.intro')}>
        <a className="ui-more" href={`${list}#earlier`}>
          {t('admin.games.toEarlier')}
        </a>
      </PageHead>
      {saved === undefined || aboutRow !== undefined ? null : (
        <SavedLine text={saved} kind={savedKind} />
      )}
      {games.some((g) => !g.scorable) ? (
        <p className="ui-notice">{t('admin.games.notScorable')}</p>
      ) : null}
      {!ok ? (
        <p className="ui-notice" data-kind="error" role="alert">
          {t('admin.games.listProblem')}
        </p>
      ) : (
        <>
          <Section
            title={t('admin.games.needsResult.title')}
            note={t('admin.games.needsResult.note')}
          >
            <Part
              rows={rows(sections.needsResult)}
              empty={needsResultEmptyText(needs.ok && needs.value.seesEveryGame)}
              scene={scene}
            />
            {needs.ok && needs.value.more ? (
              <p className="ui-section-note">
                {t('admin.games.needsResult.more', { count: String(needsResultLimit) })}
              </p>
            ) : null}
          </Section>
          <Section title={t('admin.games.todayTitle')}>
            <Part rows={rows(sections.today)} empty={t('admin.games.todayEmpty')} scene={scene} />
          </Section>
          <Section title={t('admin.games.weekTitle')}>
            {sections.days.length === 0 ? (
              <EmptyPanel text={t('admin.games.weekEmpty')} />
            ) : (
              <div className="ui-stack">
                {sections.days.map((d) => (
                  <section key={d.day} className="ui-stack" aria-labelledby={`day-${d.day}`}>
                    <h3 id={`day-${d.day}`}>{dayHeadingText(d.day, today, locale)}</h3>
                    <GameList rows={rows(d.games)} scene={scene} />
                  </section>
                ))}
              </div>
            )}
          </Section>
          {postponed.ok ? (
            <div id={waitingAnchor}>
              <Section title={t('admin.games.waiting.title')} note={t('admin.games.waiting.note')}>
                <WaitingList games={postponed.value} scene={scene} names={names} />
              </Section>
            </div>
          ) : null}
          <div id="earlier">
            <Section title={t('admin.games.earlier.title')} note={t('admin.games.earlier.note')}>
              {roundOptions.length === 0 ? (
                <div className="ui-stack">
                  <EmptyPanel text={earlierEmptyText(earlier.ok && earlier.value.seesEveryGame)} />
                  {/* Never "none" alone while rounds were left out: say only the latest are offered. */}
                  {earlier.ok && earlier.value.moreRounds ? (
                    <p className="ui-section-note">
                      {t('admin.games.earlier.moreRounds', { count: String(earlierRoundsLimit) })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="ui-stack">
                  <FilterToolbar label={t('admin.games.earlier.filters')}>
                    <RoundPicker
                      label={t('admin.games.earlier.round')}
                      submitLabel={t('admin.games.earlier.show')}
                      action={`${list}#earlier`}
                      value={shownRound?.round.key ?? ''}
                      options={[
                        { value: '', label: t('admin.games.earlier.choose') },
                        ...roundOptions,
                      ]}
                    />
                  </FilterToolbar>
                  {earlier.ok && earlier.value.moreRounds ? (
                    <p className="ui-section-note">
                      {t('admin.games.earlier.moreRounds', { count: String(earlierRoundsLimit) })}
                    </p>
                  ) : null}
                  {shownRound === null ? (
                    <p className="ui-section-note">{t('admin.games.earlier.pick')}</p>
                  ) : (
                    <section className="ui-stack" aria-labelledby="earlier-round">
                      <h3 id="earlier-round">
                        {roundOptions.find((o) => o.value === shownRound.round.key)?.label}
                      </h3>
                      <GameList
                        rows={rows(shownRound.games)}
                        scene={scene}
                        round={shownRound.round.key}
                      />
                      {shownRound.more ? (
                        <p className="ui-section-note">
                          {t('admin.games.earlier.moreGames', {
                            count: String(earlierRoundGamesLimit),
                          })}
                        </p>
                      ) : null}
                    </section>
                  )}
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </main>
  );
}

/**
 * A game a notice is about that is not on the page, named from its record as it is now (a
 * result just entered moves it to its earlier round), or undefined if it cannot be read.
 */
async function gameNamedOff(
  gameId: string,
  context: CommandContext,
  names: GameNames,
  deps: CommandDeps<TrackerTx>,
): Promise<NamedGame | undefined> {
  const sheet = await getBoxScoreSheet(context, { gameId }, deps);
  if (!sheet.ok) return undefined;
  const game = sheet.value.game;
  return {
    homeName: names.teams[game.homeTeamId] ?? '',
    awayName: names.teams[game.awayTeamId] ?? '',
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    hasPlays: false,
  };
}
