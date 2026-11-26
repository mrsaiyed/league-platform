'use client';
// The tracker's page on the device (P7 §5.1; T6 §4, §5; T-115, T-116): opens the game
// (open-tracker-game.ts), shows who holds it, asks for the format to be confirmed, and
// then draws the scoring screen (scoring-screen.tsx, step 2.35). The whole page is in the
// tracker's own frame and look (docs/build/DESIGN.md section 7; record 064): no public
// header, menu or footer, the title says the two teams, the day and the time, and there
// is one way out. The words come from the page, from the message files (T-187).
import { translatorFrom, type Catalog } from '@srleagues/site';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import './court.css';
import type { CourtBanner } from './court-view.tsx';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchGameDoors } from './fetch-game-doors.ts';
import { createFetchSignedIn } from './fetch-signed-in.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { formatLines } from './format-text.ts';
import type { StartConfirm } from '../game-format/index.ts';
import { playsFormat, TrackerFormatPanel } from './tracker-format-panel.tsx';
import { openIndexedDbOpenedGameStorage } from './indexeddb-opened-game-storage.ts';
import { openIndexedDbQueueStorage } from './indexeddb-queue-storage.ts';
import { keptRows, notAppliedRows, type KeptRow } from './kept-plays.ts';
import { openTrackerGame, screenOf, type OpenedTrackerGame } from './open-tracker-game.ts';
import { readDeviceAccount, writeDeviceAccount } from './device-account.ts';
import {
  forgetTrackerPageOfGame,
  registerTrackerWorker,
  takeNewRelease,
} from './tracker-worker-registration.ts';
import type { DeviceRosters, GameFormat } from './opened-game-storage.ts';
import {
  isOffline,
  savedBanner,
  savedBannerShortLines,
  savedBannerText,
  type SavedBanner,
} from './queue-banner.ts';
import { SaveCopy, SaveCopySuggestion } from './save-copy-parts.tsx';
import { suggestsCopy } from './game-copy-on-device.ts';
import { ScoringScreen } from './scoring-screen.tsx';
import type { ReadOnlyReason, TrackerControllerStatus } from './tracker-controller.ts';
import { LastHeard, SendNotSaved, takeOverQuestionText } from './take-over-parts.tsx';
import { showsFinalPanel, trackerNoticeText, trackerNotices } from './tracker-notice.ts';
import { inLeague } from './queue-storage.ts';
import { holdSignOut, waitingOnDevice } from './tracker-sign-out.ts';

/** Why "Enter again" did not go through, for the words shown (review M1). */
type AgainRefusal = 'refused' | 'not-taken-off';

export type TrackerOpeningProps = {
  readonly leagueId: string;
  /** The signed-in account, from the server's session: the device keeps the game under it. */
  readonly accountId: string;
  readonly gameId: string;
  readonly rosters: DeviceRosters;
  /** The game's day and time in the league's time zone, in words; null when it has none. */
  readonly when: string | null;
  /** The league's public page of this game, opened beside the tracker (checklist A4). */
  readonly watchHref: string;
  /** The game's upload page of a copy (step 2.70), built by the address helper. */
  readonly uploadHref: string;
  /** Where "back to your games" goes, leaving the game. */
  readonly backHref: string;
  /** The account page, where a shared device is signed out (and its kept games cleared). */
  readonly accountHref: string;
  /**
   * The account button of step 2.127 (the shell's AccountButton), drawn by the server: in
   * the frame's first row, so a shared tablet can be signed out (DESIGN.md section 7,
   * line 11). Its "Sign out" leaves the game first (holdSignOut, below). Null: none.
   */
  readonly account?: ReactNode;
  /** The sign-in screen, coming back to this game: offered once the device is signed out. */
  readonly signInHref: string;
  /**
   * The account works in more areas than scoring, so it may correct games: a hint for
   * the words of the Mark not started question only (step 2.37; S-40).
   */
  readonly mayCorrect?: boolean;
  readonly locale: string;
  /** The tracker's own messages (tracker-catalog.ts). */
  readonly catalog: Catalog;
  /**
   * The league's tracker worker (step 2.38, T-115), registered so the tracker reopens with
   * no signal; null where none is wanted (the development server).
   */
  readonly workerHref?: string | null;
};

type Phase =
  | { readonly kind: 'preparing' }
  | { readonly kind: 'no-storage' }
  | {
      readonly kind: 'open';
      readonly game: OpenedTrackerGame;
      readonly status: TrackerControllerStatus;
      readonly confirmed: GameFormat | null;
    };

export function TrackerOpening({
  leagueId,
  accountId,
  gameId,
  rosters,
  when,
  watchHref,
  uploadHref,
  backHref,
  accountHref,
  account = null,
  signInHref,
  mayCorrect = false,
  locale,
  catalog,
  workerHref = null,
}: TrackerOpeningProps) {
  const t = useMemo(() => translatorFrom(locale, { [locale]: catalog }), [locale, catalog]);
  useEffect(() => {
    if (workerHref !== null) void registerTrackerWorker(workerHref);
  }, [workerHref]);
  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });
  const [storeFailed, setStoreFailed] = useState(false);
  // What the browser says of the network: the saved banner says "No connection" while it
  // says there is none (queue-banner.ts), also when no play is waiting to find it out.
  const [browserOnline, setBrowserOnline] = useState(true);
  useEffect(() => {
    const read = () => setBrowserOnline(window.navigator.onLine);
    read();
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    return () => {
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);
  const [busy, setBusy] = useState(false);
  // What `busy` will be once drawn: read here, so a double tap before the next drawing
  // cannot run the same step twice.
  const working = useRef(false);
  const opened = useRef<OpenedTrackerGame | null>(null);
  const leaving = useRef(false);
  // Settles once the opening under way has stopped writing to the device (opened, or let
  // go of): a sign-out waits for it before it clears the games kept here (step 2.38).
  const opening = useRef<Promise<void>>(Promise.resolve());
  // The rosters the page last brought. The page drawn again (a refresh) brings the same
  // rosters as a new object: the game is opened once per game, league and account, not
  // let go of and taken again each time, so the opening reads them from here.
  const rostersNow = useRef(rosters);
  useEffect(() => {
    rostersNow.current = rosters;
  }, [rosters]);

  useEffect(() => {
    let gone = false;
    let unsubscribe = () => {};
    const online = () => opened.current?.controller.online();
    // The page going away (the tab closed, another address typed) releases the session,
    // as leaving by a button does (T6 §5): the release is sent with keepalive
    // (fetch-tracker-server.ts). A page brought back from the browser's back-forward
    // cache has let go of the game, so it is opened afresh.
    const hidden = () => void opened.current?.controller.leave();
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    // The page shown again (the phone woke, the tab came back): the device may have
    // slept, so the controller measures the server's time again, renews and sends.
    // Hidden, it stops checking its hold on the game until it is shown (T-295).
    const visible = () => {
      if (document.visibilityState === 'visible') opened.current?.controller.awake();
      else opened.current?.controller.hidden();
    };
    // Leaving by the browser's own ways (back, reload, the tab closed) while plays wait:
    // the browser asks in its own words, as far as it allows (lane 2.37, fix round, F1).
    // What waits is sent only while the scoring screen is open. The screen's own links
    // ask in the pad first, and do not ask twice.
    const unload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      if ((opened.current?.controller.status().queue.waiting ?? 0) > 0) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('pagehide', hidden);
    window.addEventListener('pageshow', shown);
    document.addEventListener('visibilitychange', visible);
    let settle = () => {};
    opening.current = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const open = async (): Promise<OpenedTrackerGame | null> => {
      const result = await openTrackerGame({
        gameId,
        leagueId,
        accountId,
        rosters: rostersNow.current,
        openStorage: async () => ({
          queue: await openIndexedDbQueueStorage(),
          games: await openIndexedDbOpenedGameStorage(),
        }),
        transport: createFetchCommandTransport({ leagueId, gameId }),
        server: createFetchTrackerServer({ leagueId, gameId }),
        signedIn: createFetchSignedIn(),
        // Reopen and Mark not started are requests of their own, not taps (step 2.37).
        doors: createFetchGameDoors({ leagueId, gameId }),
        newDeviceId: () => globalThis.crypto.randomUUID(),
        onStoreFailed: () => setStoreFailed(true),
        forgetPage: () => void forgetTrackerPageOfGame(window.location.href),
        // Signed out or left while opening: nothing more is kept and no session taken.
        letGo: () => gone || leaving.current,
        // With no signal, what the device kept is scored from only for the one marked
        // signed in here; once the server answers, this account is (T-327).
        deviceAccount: () => readDeviceAccount(),
        markSignedIn: async (account) => {
          await writeDeviceAccount(account);
        },
      });
      if (gone || leaving.current) {
        if (result.ok) void result.game.controller.leave();
        return null;
      }
      if (!result.ok) {
        setPhase({ kind: 'no-storage' });
        return null;
      }
      const { game } = result;
      opened.current = game;
      const show = (status: TrackerControllerStatus) =>
        setPhase({ kind: 'open', game, status, confirmed: game.confirmedFormat() });
      unsubscribe = game.controller.subscribe(show);
      show(game.controller.status());
      window.addEventListener('online', online);
      return game;
    };
    void (async () => {
      const game = await open().finally(settle);
      if (game !== null && !leaving.current) await game.controller.start();
    })();
    return () => {
      gone = true;
      unsubscribe();
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('pagehide', hidden);
      window.removeEventListener('pageshow', shown);
      document.removeEventListener('visibilitychange', visible);
      void opened.current?.controller.leave();
      opened.current = null;
    };
  }, [gameId, leagueId, accountId]);

  const act = (work: (game: OpenedTrackerGame) => Promise<unknown>) => async () => {
    const game = opened.current;
    if (game === null || working.current || leaving.current) return;
    working.current = true;
    setBusy(true);
    try {
      await work(game);
    } finally {
      working.current = false;
      setBusy(false);
      setPhase((now) =>
        now.kind === 'open'
          ? { ...now, status: game.controller.status(), confirmed: game.confirmedFormat() }
          : now,
      );
    }
  };

  // Leaving the game, by "back to your games" (the one way out: step 2.33 dropped a
  // "Leave the game" button that did the same), the link to sign out or to sign in:
  // the session is released first (T6 §5), as a page that is simply left would hold the
  // game until it runs out. It runs once however often it is tapped, and goes on to `to`
  // even if the release fails.
  const leaveGame = async (to: string) => {
    const game = opened.current;
    if (leaving.current) return;
    leaving.current = true;
    working.current = true;
    setBusy(true);
    try {
      await game?.controller.leave();
    } finally {
      window.location.assign(to);
    }
  };
  // The account button's "Sign out" (in this frame's first row: `account`) leaves the
  // game this way too (tracker-sign-out.ts): it asks when plays are waiting, then the
  // session is released before the device is signed out (T6 §5).
  useEffect(
    () =>
      holdSignOut({
        waitingPlays: () =>
          waitingOnDevice(opened.current?.controller.status().queue.waiting ?? 0, async () =>
            inLeague(await openIndexedDbQueueStorage(), leagueId, accountId).list(gameId),
          ),
        leave: async () => {
          leaving.current = true;
          working.current = true;
          setBusy(true);
          // A game still opening (just after a reload) stops before it keeps its rosters
          // again, and is waited for: the sign-out's clearing then comes last (step 2.38).
          await opening.current;
          await opened.current?.controller.leave();
        },
      }),
    [gameId, leagueId, accountId],
  );
  const leaveBy = (to: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // A link opened in a new tab or window leaves this page as it is.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    void leaveGame(to);
  };

  // Still opening after a while: most likely no connection, so the screen says so while
  // the controller keeps trying by itself (step 2.33).
  const stillOpening =
    phase.kind === 'preparing' ||
    (phase.kind === 'open' && screenOf(phase.status, phase.confirmed).kind === 'opening');
  const slow = useSlowAfter(stillOpening, slowOpeningMs);
  // A tap made in the very moment this device stopped scoring (taken over, signed out,
  // no longer allowed) reaches no list of plays not saved, and the scoring screen that
  // would have said so is gone: this page says it, until the game is scored here again.
  const scoringNow =
    phase.kind === 'open' &&
    phase.status.game !== null &&
    screenOf(phase.status, phase.confirmed).kind === 'scoring';
  const [lastTapLost, setLastTapLost] = useState(false);
  const [againRefused, setAgainRefused] = useState<AgainRefusal | null>(null);
  const wasScoring = useRef(false);
  useEffect(() => {
    if (scoringNow && !wasScoring.current) setLastTapLost(false);
    wasScoring.current = scoringNow;
  }, [scoringNow]);
  const openingText = (
    <p role="status" data-opening="">
      {t('tracker.opening')}
      {slow ? ` ${t('tracker.openingSlow')}` : null}
    </p>
  );
  // Signed out, before the game was open (read-only) or while scoring (record 054): the
  // way to sign in, coming back to this game.
  // Right under the notice that says so. Before the game was open it is the one thing to
  // do (the main button); while still scoring it sits beside the scoring, outlined.
  const readOnlySignedOut =
    phase.kind === 'open' &&
    phase.status.mode.kind === 'read-only' &&
    phase.status.mode.reason === 'signed-out';
  const signIn =
    phase.kind === 'open' && (phase.status.signedOut || readOnlySignedOut) ? (
      <p>
        <a
          className="court-button"
          {...(readOnlySignedOut ? { 'data-kind': 'main' } : {})}
          href={signInHref}
          onClick={leaveBy(signInHref)}
        >
          {t('tracker.signIn')}
        </a>
      </p>
    ) : null;
  // The rosters as the controller lists them (step 2.118): the kept ones with this
  // device's waiting changes on top, so a player added or a number fixed in the Players
  // panel is on the tiles, the log and these lists at once. The page's until it has some.
  const listed = phase.kind === 'open' ? (phase.status.rosters ?? rosters) : rosters;
  // The plays the league refused, play by play (step 2.37, part 2).
  const notApplied =
    phase.kind === 'open'
      ? notAppliedRows(phase.status.notApplied, listed, phase.status.game?.rules.periods ?? 2, t)
      : [];
  const clearNotApplied = act((game) => game.controller.dismissNotApplied());
  // "Enter again" (S-77): a new play now, by the path of a tap; said when not taken.
  const lists: KeptLists = {
    notApplied,
    onClearNotApplied: clearNotApplied,
    kept:
      phase.kind === 'open'
        ? keptRows(phase.status.notSaved, listed, phase.status.game?.rules.periods ?? 2, t)
        : [],
    onClearKept: act((game) => game.controller.dismissNotSaved()),
    onSendNotSaved: act(async (game) => {
      await game.controller.sendNotSaved();
    }),
    onEnterAgain: (id) =>
      void act(async (game) => {
        const result = await game.controller.enterAgain(id);
        setAgainRefused(
          result.ok ? null : result.reason === 'not-taken-off' ? 'not-taken-off' : 'refused',
        );
      })(),
    againRefused,
  };
  const storeFailedNotice = storeFailed ? (
    <p className="court-notice" data-kind="error" role="alert">
      {t('tracker.storeFailed')}
    </p>
  ) : null;

  // The server's answer brought another format than this device played (T-344): it plays
  // the server's now, and says so until the scorekeeper has read it.
  const formatChangedTo = phase.kind === 'open' ? phase.status.formatChangedTo : null;
  const formatNotice =
    formatChangedTo === null ? null : (
      <p className="court-notice" role="status" data-format-changed-to="">
        {t('tracker.formatChangedTo', {
          format: formatLines(formatChangedTo, t, locale).join('; '),
        })}{' '}
        <button
          type="button"
          className="court-button"
          onClick={act((game) => game.controller.dismissFormatChanged())}
        >
          {t('tracker.formatChangedTo.dismiss')}
        </button>
      </p>
    );

  const matchup = t('tracker.matchup', { away: listed.away.name, home: listed.home.name });
  // "Save a copy" (step 2.70): behind More while scoring; offered outright to an account
  // that can no longer open the game, to hand the kept taps to the league's admin (T-456).
  const copyProps = { leagueId, gameId, accountId, uploadHref, t };

  // The scoring screen, once this device holds the game and its format is confirmed. And
  // it stays while the game it shows is final (step 2.37): about half a minute after an
  // End is saved the league tells the device the game is over, and the screen with its
  // final panel (the score, Reopen with the time left) is not swapped for a card that
  // says "this game is over". Reopened, the same screen carries on.
  if (
    phase.kind === 'open' &&
    phase.status.game !== null &&
    (screenOf(phase.status, phase.confirmed).kind === 'scoring' || showsFinalPanel(phase.status))
  ) {
    // With no connection the banner says so, and never "All saved" (step 2.37).
    const offline = isOffline(phase.status.queue, browserOnline);
    const banner = savedBanner(phase.status.queue, offline, keptOnly(phase.status));
    const notices = trackerNotices(phase.status);
    // "Save a copy" (step 2.70): behind More always, suggested after minutes offline.
    const suggestCopy = suggestsCopy(phase.status);
    const anythingToTell =
      notices.length > 0 ||
      signIn !== null ||
      storeFailedNotice !== null ||
      formatNotice !== null ||
      suggestCopy;
    return (
      <ScoringScreen
        game={phase.game}
        slots={{ more: <SaveCopy {...copyProps} /> }}
        status={phase.status}
        state={phase.status.game}
        rosters={listed}
        gameId={gameId}
        accountId={accountId}
        t={t}
        title={matchup}
        when={when}
        banner={{
          text: savedBannerText(banner, t),
          short: savedBannerShortLines(banner, t),
          state: bannerState(banner),
        }}
        notices={
          anythingToTell ? (
            <>
              <Notices status={phase.status} t={t} lists={lists} busy={busy} />
              {suggestCopy ? <SaveCopySuggestion {...copyProps} /> : null}
              {signIn}
              {formatNotice}
              {storeFailedNotice}
            </>
          ) : null
        }
        links={{ back: backHref, account: accountHref, watch: watchHref }}
        account={account}
        leave={leaveBy}
        onNotRecorded={() => setLastTapLost(true)}
        mayCorrect={mayCorrect}
        offline={offline}
      />
    );
  }

  return (
    <main className="court court-opening" data-tracker="">
      <div className="court-card">
        <header className="court-card-head" data-with-account={account === null ? undefined : ''}>
          {account === null ? null : <div className="court-account">{account}</div>}
          <p className="court-label">{t('tracker.title')}</p>
          <h1 className="court-title">
            <span className="court-title-teams">{matchup}</span>
            {when === null ? null : <span className="court-title-when">{when}</span>}
          </h1>
        </header>
        <section className="court-card-body" aria-label={matchup}>
          {lastTapLost ? (
            <p className="court-notice" data-kind="error" role="alert" data-last-tap-lost="">
              {t('tracker.lastTapNotRecorded')}
            </p>
          ) : null}
          {phase.kind === 'preparing' ? openingText : null}
          {phase.kind === 'no-storage' ? (
            <p className="court-notice" data-kind="error" role="alert">
              {t('tracker.noStorage')}
            </p>
          ) : null}
          {phase.kind === 'open' ? (
            <OpenGame
              phase={phase}
              t={t}
              locale={locale}
              busy={busy}
              openingText={openingText}
              signIn={signIn}
              saveCopy={<SaveCopy {...copyProps} />}
              onTakeOver={act((game) => game.controller.takeOver())}
              onOpenAgain={act((game) => game.controller.openAgain())}
              lists={lists}
              onConfirm={(format) => act((game) => game.confirmFormat(format))()}
              formatPanel={(fallback, confirm) => (
                <TrackerFormatPanel
                  {...{ leagueId, gameId, t, locale, fallback, confirm }}
                  onChanged={() => phase.game.controller.formatChanged()}
                />
              )}
            />
          ) : null}
          {formatNotice}
          {storeFailedNotice}
        </section>
        <footer className="court-card-foot">
          <a className="court-button" href={backHref} onClick={leaveBy(backHref)}>
            {t('tracker.back')}
          </a>
          <p className="court-quiet" data-shared-device="">
            {t('tracker.sharedDevice.text')}{' '}
            <a href={accountHref} onClick={leaveBy(accountHref)}>
              {t('tracker.sharedDevice.link')}
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}

/** How the saved banner is drawn: calm when all is saved, amber while plays wait. */
function bannerState(banner: SavedBanner): CourtBanner['state'] {
  const first = banner[0].key;
  if (first === 'tracker.queue.allSaved') return 'saved';
  // No connection is not a fault: the plays are kept, and wait as the others do.
  return first === 'tracker.queue.waiting' ||
    first === 'tracker.queue.kept' ||
    first === 'tracker.queue.offline'
    ? 'waiting'
    : 'trouble';
}

/**
 * Signed out, or no longer allowed to score (step 2.37, part 2): the plays the device
 * holds are not on their way, so the banner says they are kept, not waiting to send.
 */
const keptOnly = (status: Pick<TrackerControllerStatus, 'mode' | 'signedOut'>): boolean =>
  status.signedOut ||
  (status.mode.kind === 'read-only' &&
    (status.mode.reason === 'not-allowed' ||
      status.mode.reason === 'signed-out' ||
      status.mode.reason === 'cannot-open'));

/** The two lists of kept plays, and what can be done with them (step 2.37, part 2). */
type KeptLists = {
  /** The plays the league refused, play by play, and the tap that clears them. */
  readonly notApplied: readonly KeptRow[];
  readonly onClearNotApplied: () => void;
  /** The plays this device made that will not be sent, play by play. */
  readonly kept: readonly KeptRow[];
  /** The scorekeeper has seen them: the list goes only by this deliberate tap. */
  readonly onClearKept: () => void;
  /** "Send these plays", the scorekeeper's own tap (S-43, T-335). */
  readonly onSendNotSaved: () => void;
  /** "Enter again" on one play, while this device holds the game (S-77). */
  readonly onEnterAgain: (id: string) => void;
  /** The last "Enter again" was not taken: the game as it stands does not take it. */
  readonly againRefused: AgainRefusal | null;
};

/**
 * What the tracker tells about holding the game and taps that did not go in; under them
 * the plays the league refused and the plays not saved, play by play, each cleared only
 * by a deliberate tap (step 2.37, part 2). While this device holds the game each play
 * can be entered again; on a device that does not, the list is for reading out (S-77).
 */
function Notices({
  status,
  t,
  lists,
  busy,
}: {
  readonly status: TrackerControllerStatus;
  readonly t: ReturnType<typeof translatorFrom>;
  readonly lists: KeptLists;
  readonly busy: boolean;
}) {
  const notices = trackerNotices(status);
  const holds = status.mode.kind === 'scoring';
  const list = (
    name: 'not-applied' | 'kept',
    rows: readonly KeptRow[],
    title: string,
    clear: string,
    onClear: () => void,
  ) =>
    rows.length === 0 ? null : (
      <section
        className="court-stack"
        aria-labelledby={`tracker-${name}`}
        {...(name === 'kept' ? { 'data-kept-list': '' } : { 'data-not-applied-list': '' })}
      >
        <h2 id={`tracker-${name}`}>{title}</h2>
        {holds ? null : (
          <p className="court-quiet" data-read-aloud="">
            {t('tracker.keptList.readAloud')}
          </p>
        )}
        <ol className="court-stack court-kept-list">
          {rows.map((row) => (
            <li
              key={row.id}
              {...(name === 'kept' ? { 'data-kept-play': '' } : { 'data-not-applied-play': '' })}
            >
              {row.when === null ? null : <span className="court-quiet">{row.when} </span>}
              {row.text}
              {holds && row.again ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="court-button"
                    data-enter-again=""
                    aria-label={t('tracker.keptList.againLabel', { play: row.text })}
                    onClick={() => lists.onEnterAgain(row.id)}
                    disabled={busy}
                  >
                    {t('tracker.keptList.again')}
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
        {name === 'kept' ? (
          <SendNotSaved
            offer={status.sendNotSaved}
            cannotTell={status.cannotTell}
            busy={busy}
            onSend={lists.onSendNotSaved}
            t={t}
          />
        ) : null}
        <p>
          <button type="button" className="court-button" onClick={onClear} disabled={busy}>
            {clear}
          </button>
        </p>
      </section>
    );
  return notices.length === 0 ? null : (
    <div role="alert" className="court-stack" data-tracker-notices="">
      {notices.map((notice) => (
        <p key={notice.key} className="court-notice">
          {trackerNoticeText(notice, t)}
        </p>
      ))}
      {lists.againRefused !== null ? (
        <p className="court-notice" data-kind="error" data-again-refused={lists.againRefused}>
          {t(
            lists.againRefused === 'not-taken-off'
              ? 'tracker.keptList.againNotTakenOff'
              : 'tracker.keptList.againRefused',
          )}
        </p>
      ) : null}
      {list(
        'not-applied',
        lists.notApplied,
        t('tracker.notAppliedList.title'),
        t('tracker.notAppliedList.clear'),
        lists.onClearNotApplied,
      )}
      {list(
        'kept',
        lists.kept,
        t('tracker.keptList.title'),
        t('tracker.keptList.clear'),
        lists.onClearKept,
      )}
    </div>
  );
}

/** How long "Opening the game…" stands alone before it mentions the connection. */
const slowOpeningMs = 10_000;

/**
 * Whether `active` has stayed true for `afterMs`: false again as soon as it is not. The
 * timer runs once per stretch of `active`, whatever is drawn in between.
 */
function useSlowAfter(active: boolean, afterMs: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setSlow(true), afterMs);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [active, afterMs]);
  return active && slow;
}

/**
 * Whether opening the game again can help: not for someone signed out (the way to sign
 * in comes back to this game) or sent to a game that is not there. No longer allowed to
 * score, it can: an admin may give the game back, and the plays kept here are then sent
 * (step 2.37, part 2; the notice says "open it again here").
 */
const mayOpenAgain = (reason: ReadOnlyReason): boolean =>
  reason !== 'signed-out' &&
  reason !== 'unknown-game' &&
  // A game that is over is not opened again (step 2.37, part 2), and a tracker that
  // needs an update is reloaded instead: the server would refuse it again.
  reason !== 'game-not-live' &&
  reason !== 'update-needed';

function OpenGame({
  phase,
  t,
  locale,
  busy,
  openingText,
  signIn,
  saveCopy,
  onTakeOver,
  onOpenAgain,
  lists,
  onConfirm,
  formatPanel,
}: {
  readonly phase: Extract<Phase, { kind: 'open' }>;
  readonly t: ReturnType<typeof translatorFrom>;
  readonly locale: string;
  readonly busy: boolean;
  /** "Opening the game…", and after a while a word about the connection. */
  readonly openingText: ReactNode;
  /** The way to sign in, shown under the notices when the device is signed out. */
  readonly signIn: ReactNode;
  /** "Save a copy" (step 2.70), shown when this account can no longer open the game (T-456). */
  readonly saveCopy: ReactNode;
  readonly onTakeOver: () => void;
  readonly onOpenAgain: () => void;
  /** The plays kept on this device, play by play (step 2.37, part 2). */
  readonly lists: KeptLists;
  readonly onConfirm: (format: GameFormat) => void;
  /** Every rule and "Change the format" (step 2.119), the device's lines meanwhile. */
  readonly formatPanel: (fallback: ReactNode, confirm: StartConfirm) => ReactNode;
}) {
  const { status, confirmed } = phase;
  const screen = screenOf(status, confirmed);
  // Taking over asks first (T6 §5, P7 §5.2): the other device stops scoring, and plays
  // it has not sent yet are lost.
  const [askingTakeOver, setAskingTakeOver] = useState(false);
  // Asked again if the game is let go of and then held by another device once more.
  useEffect(() => {
    if (screen.kind !== 'held-by-other') setAskingTakeOver(false);
  }, [screen.kind]);
  // Who holds the game and when their device was last heard from (S-42): the minutes
  // are read again every quarter minute while the question stands.
  const holder = status.mode.kind === 'held-by-other' ? status.mode.holder : null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (holder === null) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [holder]);
  const lastHeard =
    holder === null ? null : (
      <LastHeard lastHeardAt={holder.lastHeardAt} now={status.now()} t={t} />
    );
  const banner = savedBanner(status.queue, false, keptOnly(status));
  // Before the scoring screen, "All saved" would say nothing: the banner is shown only
  // when taps are waiting, refused or cannot be stored.
  const showBanner = banner[0].key !== 'tracker.queue.allSaved';
  return (
    <>
      {showBanner ? (
        <p
          className="court-banner"
          role="status"
          aria-live="polite"
          data-saved-banner=""
          data-state={bannerState(banner)}
        >
          {savedBannerText(banner, t)}
        </p>
      ) : null}
      <Notices status={status} t={t} lists={lists} busy={busy} />
      {signIn}
      {screen.kind === 'opening' ? openingText : null}
      {screen.kind === 'held-by-other' && !askingTakeOver ? lastHeard : null}
      {screen.kind === 'held-by-other' && !askingTakeOver ? (
        <p>
          <button
            type="button"
            className="court-button"
            data-kind="main"
            onClick={() => setAskingTakeOver(true)}
            disabled={busy}
          >
            {t('tracker.takeOver')}
          </button>
        </p>
      ) : null}
      {screen.kind === 'held-by-other' && askingTakeOver ? (
        <section className="court-stack" aria-labelledby="tracker-take-over" data-take-over="">
          <p id="tracker-take-over">
            {takeOverQuestionText(
              { name: screen.name, sameAccount: holder?.sameAccount === true },
              t,
            )}
          </p>
          {lastHeard}
          <p className="court-row">
            <button
              type="button"
              className="court-button"
              data-kind="main"
              onClick={() => {
                setAskingTakeOver(false);
                onTakeOver();
              }}
              disabled={busy}
            >
              {t('tracker.takeOverYes')}
            </button>
            <button
              type="button"
              className="court-button"
              onClick={() => setAskingTakeOver(false)}
              disabled={busy}
            >
              {t('tracker.takeOverNo')}
            </button>
          </p>
        </section>
      ) : null}
      {screen.kind === 'read-only' && screen.reason === 'cannot-open' ? saveCopy : null}
      {screen.kind === 'read-only' && mayOpenAgain(screen.reason) ? (
        <p>
          <button type="button" className="court-button" onClick={onOpenAgain} disabled={busy}>
            {/* Taken over: opening again shows who has the game, and offers it back. */}
            {t(screen.reason === 'taken-over' ? 'tracker.seeWhoIsScoring' : 'tracker.openAgain')}
          </button>
        </p>
      ) : null}
      {screen.kind === 'read-only' && screen.reason === 'update-needed' ? (
        <p>
          <button
            type="button"
            className="court-button"
            data-kind="main"
            data-reload=""
            onClick={() => void takeNewRelease().then(() => window.location.reload())}
          >
            {t('tracker.readOnly.reload')}
          </button>
        </p>
      ) : null}
      {screen.kind === 'confirm-format' ? (
        <section className="court-stack" aria-labelledby="tracker-format-title" data-format="">
          <h2 id="tracker-format-title">{t('tracker.format.title')}</h2>
          <p>{t('tracker.format.intro')}</p>
          {formatPanel(
            <ul className="court-format">
              {formatLines(screen.format, t, locale).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>,
            {
              label: t('tracker.format.confirm'),
              busy,
              playing: playsFormat(screen.format),
              onStart: () => onConfirm(screen.format),
            },
          )}
        </section>
      ) : null}
    </>
  );
}
