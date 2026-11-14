// Drawing a game's page again from the server when its game starts or ends (step 2.45,
// record 051), with care: every viewer of a game sees the same change at the same moment,
// so each waits a random 0 to 5 seconds first, then asks for the page and reloads only
// if the page answers; otherwise the scoreboard already drawn keeps working. A page
// reloads at most once for any one sequence number, so a stale cached page cannot make
// it reload over and over.

/** What redrawing needs from the device, so tests can stand in for it. */
export type RedrawDevice = {
  /** A number from 0 up to (not including) 1. */
  readonly random: () => number;
  readonly setTimeout: (run: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  /** Whether the page's own address answers OK just now. */
  readonly pageAnswers: () => Promise<boolean>;
  readonly reload: () => void;
  /** The session's storage; it may be missing or refuse, and redrawing still works. */
  readonly storage: () => Pick<Storage, 'getItem' | 'setItem'> | null;
};

export type RedrawOptions = {
  readonly gameId: string;
  /** The sequence number the game is at, the one this reload is for. */
  readonly sequence: number;
  /** The longest random wait. Default 5 s. */
  readonly spreadMs?: number;
};

const storageKey = (gameId: string) => `srleagues.game-redrawn.${gameId}`;

function readRedrawn(device: RedrawDevice, gameId: string): string | null {
  try {
    return device.storage()?.getItem(storageKey(gameId)) ?? null;
  } catch {
    return null;
  }
}

function rememberRedrawn(device: RedrawDevice, gameId: string, sequence: number): void {
  try {
    device.storage()?.setItem(storageKey(gameId), String(sequence));
  } catch {
    // Not remembered: the page still reloads, and only the loop guard is lost.
  }
}

/** Starts the redraw; the function returned cancels it if it has not happened yet. */
export function redrawPage(options: RedrawOptions, device: RedrawDevice): () => void {
  if (readRedrawn(device, options.gameId) === String(options.sequence)) return () => {};
  const spreadMs = options.spreadMs ?? 5_000;
  let cancelled = false;
  const handle = device.setTimeout(
    () => {
      void device
        .pageAnswers()
        .catch(() => false)
        .then((ok) => {
          if (cancelled || !ok) return;
          rememberRedrawn(device, options.gameId, options.sequence);
          device.reload();
        });
    },
    Math.floor(device.random() * spreadMs),
  );
  return () => {
    cancelled = true;
    device.clearTimeout(handle);
  };
}

/** The device's own: the window, its timers and its session storage. */
export const browserRedrawDevice: RedrawDevice = {
  random: () => Math.random(),
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  pageAnswers: async () => {
    try {
      const answer = await fetch(window.location.href, { cache: 'no-store' });
      return answer.ok;
    } catch {
      return false;
    }
  },
  reload: () => window.location.reload(),
  storage: () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  },
};
