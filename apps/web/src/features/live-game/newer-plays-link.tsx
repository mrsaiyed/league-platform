'use client';
// "Show newer plays" on a live game's page (step 2.45, S-33): the page is read again and
// lands on its play-by-play, not on the top. A link to the page's own address with only
// its anchor added would just scroll the page already there, so a click puts the address
// with that anchor in place and reads the page again; the browser then goes to the
// anchor rather than back to where it was.
import type { MouseEvent, ReactNode } from 'react';

/** What a click needs from the window, so tests can stand in for it. */
export type ReloadWindow = {
  readonly history: Pick<History, 'replaceState'> & { scrollRestoration: ScrollRestoration };
  readonly location: Pick<Location, 'reload'>;
};

/** Puts `href` in the address bar and reads the page again, landing on its anchor. */
export function reloadAt(href: string, win: ReloadWindow): void {
  win.history.replaceState(null, '', href);
  win.history.scrollRestoration = 'manual';
  win.location.reload();
}

export function NewerPlaysLink({
  href,
  children,
}: {
  /** The page's own address with the play-by-play's anchor. */
  readonly href: string;
  readonly children: ReactNode;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // A click to open it elsewhere (a new tab, say) is the browser's own.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    reloadAt(href, window);
  };
  return (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  );
}
