'use client';
// "Your games" on the device (step 2.38; S-88, T-317): above the server's list of the
// scorekeeper's games, every game of this league this device holds plays for that the
// league does not have, however old the game, until they are sent or dismissed. The
// server cannot see the device's storage, so this part is drawn on the device, and
// draws nothing where nothing is held or the device has no storage. Dismiss asks first,
// saying what is lost (dismissQuestion). The words come from the page (T-187).
import { translatorFrom, type Catalog } from '@srleagues/site';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dismissQuestion,
  heldGameHref,
  heldGames,
  heldGameWords,
  type HeldGame,
} from './held-games.ts';
import { openIndexedDbOpenedGameStorage } from './indexeddb-opened-game-storage.ts';
import { openIndexedDbQueueStorage } from './indexeddb-queue-storage.ts';
import type { OpenedGame } from './opened-game-storage.ts';

export type HeldGamesPanelProps = {
  readonly leagueId: string;
  /** The signed-in account, from the server's session: only its own plays are listed (T-321). */
  readonly accountId: string | null;
  /** The tracker's address for `heldGameMark`, built by the address helper (held-games.ts). */
  readonly scoreHref: string;
  readonly locale: string;
  /** The `tracker.held.` messages of the page's language. */
  readonly catalog: Catalog;
};

/** The games kept on this device, or nothing. */
export function HeldGamesPanel({
  leagueId,
  accountId,
  scoreHref,
  locale,
  catalog,
}: HeldGamesPanelProps) {
  const t = useMemo(() => translatorFrom(locale, { [locale]: catalog }), [locale, catalog]);
  const [games, setGames] = useState<readonly HeldGame[]>([]);
  const [dismissFailed, setDismissFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await (await openIndexedDbQueueStorage()).listAll();
      const kept = new Map<string, OpenedGame>();
      if (all.length > 0) {
        try {
          const opened = await openIndexedDbOpenedGameStorage();
          for (const gameId of new Set(all.map((entry) => entry.gameId))) {
            const game = await opened.find(gameId);
            if (game !== undefined) kept.set(gameId, game);
          }
        } catch {
          // The teams' names are not known: each game is listed all the same.
        }
      }
      setGames(heldGames(all, { leagueId, accountId }, (gameId) => kept.get(gameId)));
    } catch {
      // No storage on this device: nothing can be held on it.
      setGames([]);
    }
  }, [leagueId, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = async (game: HeldGame) => {
    if (!window.confirm(dismissQuestion(game, t))) return;
    try {
      await (await openIndexedDbQueueStorage()).forget(game.gameId, accountId);
      setDismissFailed(false);
    } catch {
      setDismissFailed(true);
    }
    await load();
  };

  if (games.length === 0) return null;
  const when = (ms: number) =>
    new Date(ms).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <section className="admin-held-games ui-stack" data-held-games="">
      <h2>{t('tracker.held.title')}</h2>
      <p>{t('tracker.held.intro')}</p>
      {dismissFailed ? (
        <p className="ui-notice" data-kind="error" role="alert">
          {t('tracker.held.dismissFailed')}
        </p>
      ) : null}
      <ul className="ui-card-grid">
        {games.map((game) => {
          const words = heldGameWords(game, t);
          return (
            <li
              key={game.gameId}
              data-held-game={game.gameId}
              data-waiting={game.waiting}
              data-not-saved={game.notSaved}
            >
              <div className="admin-game-panel admin-my-game">
                <p>
                  <strong>{words.name}</strong>
                </p>
                <p data-held-counts="">{words.counts.join(' · ')}</p>
                <p>{t('tracker.held.lastTap', { when: when(game.lastTapAt) })}</p>
                <p>
                  <a
                    className="ui-button"
                    data-kind="main"
                    data-held-open=""
                    href={heldGameHref(scoreHref, game.gameId)}
                  >
                    {t(game.waiting > 0 ? 'tracker.held.open' : 'tracker.held.openToSee')}
                  </a>{' '}
                  <button
                    type="button"
                    className="ui-button"
                    data-held-dismiss=""
                    onClick={() => void dismiss(game)}
                  >
                    {t('tracker.held.dismiss')}
                  </button>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
