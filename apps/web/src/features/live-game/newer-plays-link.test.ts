// "Show newer plays" (step 2.45, S-33): it reads the page again and lands on the
// play-by-play, rather than only scrolling the page already there.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NewerPlaysLink, reloadAt, type ReloadWindow } from './newer-plays-link.tsx';

describe('the newer plays link', () => {
  it('is a plain link to the play-by-play', () => {
    const html = renderToStaticMarkup(
      createElement(NewerPlaysLink, { href: '/self#game-plays', children: 'Show newer plays' }),
    );
    expect(html).toBe('<a href="/self#game-plays">Show newer plays</a>');
  });

  it('puts the anchor in the address and reads the page again, landing on it', () => {
    const done: string[] = [];
    const win: ReloadWindow = {
      history: {
        scrollRestoration: 'auto',
        replaceState: (_data, _unused, url) => void done.push(`address ${String(url)}`),
      },
      location: { reload: () => void done.push('reload') },
    };
    reloadAt('/self#game-plays', win);
    expect(done).toEqual(['address /self#game-plays', 'reload']);
    expect(win.history.scrollRestoration).toBe('manual');
  });
});
