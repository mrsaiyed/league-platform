'use client';
// The tracker's page on the device (P7 §5.1; T6 §4, §5; T-115, T-116): opens the game
// (open-tracker-game.ts), shows who holds it, asks for the format to be confirmed, and
// then holds the place where the scoring screens of steps 2.35 to 2.37 will draw. Plain
// forms and messages only. The words come from the page, from the message files (T-187).
import { createTranslator, type Catalog } from '@srleagues/site';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createFetchCommandTransport } from './fetch-command-transport.ts';
import { createFetchTrackerServer } from './fetch-tracker-server.ts';
import { formatLines } from './format-text.ts';
import { openIndexedDbOpenedGameStorage } from './indexeddb-opened-game-storage.ts';
import { openIndexedDbQueueStorage } from './indexeddb-queue-storage.ts';
import { openTrackerGame, screenOf, type OpenedTrackerGame } from './open-tracker-game.ts';
import type { DeviceRosters, GameFormat } from './opened-game-storage.ts';
import { savedBanner, savedBannerText } from './queue-banner.ts';
import type { TrackerControllerStatus } from './tracker-controller.ts';
import { trackerNoticeText, trackerNotices } from './tracker-notice.ts';

export type TrackerOpeningProps = {
  readonly leagueId: string;
  /** The signed-in account, from the server's session: the device keeps the game under it. */
  readonly accountId: string;
  readonly gameId: string;
  readonly rosters: DeviceRosters;
  /** Where "back to your games" and leaving the game go. */
  readonly backHref: string;
  readonly locale: string;
  /** The tracker's own messages (tracker-catalog.ts). */
  readonly catalog: Catalog;
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
  backHref,
  locale,
  catalog,
}: TrackerOpeningProps) {
  const t = useMemo(() => createTranslator(locale, { [locale]: catalog }), [locale, catalog]);
  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });
  const [storeFailed, setStoreFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // What `busy` will be once drawn: read here, so a double tap before the next drawing
  // cannot run the same step twice.
  const working = useRef(false);
  const opened = useRef<OpenedTrackerGame | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    let gone = false;
    let unsubscribe = () => {};
    const online = () => opened.current?.controller.online();
    void (async () => {
      const result = await openTrackerGame({
        gameId,
        leagueId,
        accountId,
        rosters,
        openStorage: async () => ({
          queue: await openIndexedDbQueueStorage(),
          games: await openIndexedDbOpenedGameStorage(),
        }),
        transport: createFetchCommandTransport({ leagueId, gameId }),
        server: createFetchTrackerServer({ leagueId, gameId }),
        newDeviceId: () => globalThis.crypto.randomUUID(),
        onStoreFailed: () => setStoreFailed(true),
      });
      if (gone) {
        if (result.ok) void result.game.controller.leave();
        return;
      }
      if (!result.ok) {
        setPhase({ kind: 'no-storage' });
        return;
      }
      const { game } = result;
      opened.current = game;
      const show = (status: TrackerControllerStatus) =>
        setPhase({ kind: 'open', game, status, confirmed: game.confirmedFormat() });
      unsubscribe = game.controller.subscribe(show);
      show(game.controller.status());
      window.addEventListener('online', online);
      await game.controller.start();
    })();
    return () => {
      gone = true;
      unsubscribe();
      window.removeEventListener('online', online);
      void opened.current?.controller.leave();
      opened.current = null;
    };
  }, [gameId, leagueId, accountId, rosters]);

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

  // Leaving the game, by its button or by "back to your games": the session is released
  // first (T6 §5), as a page that is simply left would hold the game until it runs out.
  // It runs once however often it is tapped, and goes back even if the release fails.
  const leaveGame = async () => {
    const game = opened.current;
    if (leaving.current) return;
    leaving.current = true;
    working.current = true;
    setBusy(true);
    try {
      await game?.controller.leave();
    } finally {
      window.location.assign(backHref);
    }
  };
  const back = (event: MouseEvent<HTMLAnchorElement>) => {
    // A link opened in a new tab or window leaves this page as it is.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    void leaveGame();
  };

  const matchup = t('tracker.matchup', { away: rosters.away.name, home: rosters.home.name });
  return (
    <main className="score-root">
      <h1>{t('tracker.title')}</h1>
      <p>{matchup}</p>
      {phase.kind === 'preparing' ? <p role="status">{t('tracker.opening')}</p> : null}
      {phase.kind === 'no-storage' ? <p role="alert">{t('tracker.noStorage')}</p> : null}
      {phase.kind === 'open' ? (
        <OpenGame
          phase={phase}
          t={t}
          locale={locale}
          rosters={rosters}
          busy={busy}
          onTakeOver={act((game) => game.controller.takeOver())}
          onOpenAgain={act((game) => game.controller.openAgain())}
          onConfirm={(format) => act((game) => game.confirmFormat(format))()}
          onLeave={() => void leaveGame()}
        />
      ) : null}
      {storeFailed ? <p role="alert">{t('tracker.storeFailed')}</p> : null}
      <p>
        <a href={backHref} onClick={back}>
          {t('tracker.back')}
        </a>
      </p>
    </main>
  );
}

function OpenGame({
  phase,
  t,
  locale,
  rosters,
  busy,
  onTakeOver,
  onOpenAgain,
  onConfirm,
  onLeave,
}: {
  readonly phase: Extract<Phase, { kind: 'open' }>;
  readonly t: ReturnType<typeof createTranslator>;
  readonly locale: string;
  readonly rosters: DeviceRosters;
  readonly busy: boolean;
  readonly onTakeOver: () => void;
  readonly onOpenAgain: () => void;
  readonly onConfirm: (format: GameFormat) => void;
  readonly onLeave: () => void;
}) {
  const { status, confirmed } = phase;
  const screen = screenOf(status, confirmed);
  const notices = trackerNotices(status);
  return (
    <>
      <p role="status" aria-live="polite" data-saved-banner="">
        {savedBannerText(savedBanner(status.queue), t)}
      </p>
      {notices.length === 0 ? null : (
        <ul role="alert" data-tracker-notices="">
          {notices.map((notice) => (
            <li key={notice.key}>{trackerNoticeText(notice, t)}</li>
          ))}
        </ul>
      )}
      {screen.kind === 'opening' ? <p>{t('tracker.opening')}</p> : null}
      {screen.kind === 'held-by-other' ? (
        <button type="button" onClick={onTakeOver} disabled={busy}>
          {t('tracker.takeOver')}
        </button>
      ) : null}
      {screen.kind === 'read-only' ? (
        <button type="button" onClick={onOpenAgain} disabled={busy}>
          {t('tracker.openAgain')}
        </button>
      ) : null}
      {screen.kind === 'confirm-format' ? (
        <section aria-labelledby="tracker-format-title" data-format="">
          <h2 id="tracker-format-title">{t('tracker.format.title')}</h2>
          <p>{t('tracker.format.intro')}</p>
          <ul>
            {formatLines(screen.format, t, locale).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{t('tracker.format.wrong')}</p>
          <button type="button" onClick={() => onConfirm(screen.format)} disabled={busy}>
            {t('tracker.format.confirm')}
          </button>
        </section>
      ) : null}
      {screen.kind === 'scoring' ? (
        // Where the scoring screens of steps 2.35 to 2.37 will draw.
        <section data-scoring="">
          <p>{t('tracker.ready')}</p>
          <p>
            {t('tracker.savedOnDevice', {
              home: rosters.home.name,
              homeCount: rosters.home.players.length,
              away: rosters.away.name,
              awayCount: rosters.away.players.length,
            })}
          </p>
          <button type="button" onClick={onLeave} disabled={busy}>
            {t('tracker.leave')}
          </button>
        </section>
      ) : null}
    </>
  );
}
