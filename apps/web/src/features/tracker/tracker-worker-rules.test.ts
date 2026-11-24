import { describe, expect, it } from 'vitest';
import {
  accountMarkOfPage,
  codeMarkOf,
  keptAddressOf,
  mayKeepAnswer,
  deviceAccountOf,
  gamesHoldingBack,
  mayReplaceStored,
  mayServeKeptPage,
  pageAnswerPlan,
  signedInFrom,
  trackerAccountMetaName,
  trackerScopeOf,
} from './tracker-worker-rules.ts';

const scope = 'https://site.test/north/score/';
const page = (path: string, more: Partial<{ method: string; mode: string }> = {}) => ({
  url: `https://site.test${path}`,
  method: 'GET',
  mode: 'navigate',
  ...more,
});

describe('what the tracker worker keeps (step 2.38, T-115)', () => {
  it('keeps a game page of its league, under its address without the query', () => {
    expect(keptAddressOf(page('/north/score/g-1?from=list#top'), scope)).toEqual({
      kind: 'page',
      key: 'https://site.test/north/score/g-1',
    });
    expect(keptAddressOf(page('/north/score/g-1/'), scope)?.key).toBe(
      'https://site.test/north/score/g-1',
    );
  });

  it('keeps the built code and the shared stylesheets a page loads', () => {
    for (const path of [
      '/_next/static/chunks/a1.js',
      '/_next/static/media/f.woff2',
      '/display.css?v=3',
    ]) {
      expect(keptAddressOf(page(path, { mode: 'no-cors' }), scope)).toEqual({
        kind: 'code',
        key: `https://site.test${path}`,
      });
    }
  });

  it('keeps nothing else: other pages, other leagues, API answers, forms, other sites', () => {
    const never = [
      page('/north/admin'),
      page('/north/score'),
      page('/north/score/'),
      page('/south/score/g-1'),
      page('/north/score/g-1/more'),
      page('/north/score/manifest.webmanifest'),
      page('/north/score/tracker-worker.js'),
      page('/north/score/g-1', { mode: 'cors' }),
      page('/north/score/g-1', { method: 'POST' }),
      page('/api/leagues/north/games/g-1/state', { mode: 'cors' }),
      page('/_next/static/chunks/a1.js', { method: 'POST', mode: 'cors' }),
      page('/_next/static/chunks/a1.js'),
      { url: 'https://other.test/_next/static/chunks/a1.js', method: 'GET', mode: 'no-cors' },
      { url: 'not an address', method: 'GET', mode: 'navigate' },
    ];
    for (const request of never) expect(keptAddressOf(request, scope)).toBeNull();
  });

  it('keeps only whole answers from our own address, never one sent elsewhere (signing in)', () => {
    expect(mayKeepAnswer({ status: 200, type: 'basic', redirected: false })).toBe(true);
    expect(mayKeepAnswer({ status: 200, type: 'basic', redirected: true })).toBe(false);
    expect(mayKeepAnswer({ status: 403, type: 'basic', redirected: false })).toBe(false);
    expect(mayKeepAnswer({ status: 404, type: 'basic', redirected: false })).toBe(false);
    expect(mayKeepAnswer({ status: 0, type: 'opaque', redirected: false })).toBe(false);
  });
});

describe('the update rule (T-127): the stored tracker is replaced only when no game is open', () => {
  it('replaces only when the device has no game open, and never when it cannot tell', () => {
    expect(mayReplaceStored(0)).toBe(true);
    expect(mayReplaceStored(1)).toBe(false);
    expect(mayReplaceStored(3)).toBe(false);
    expect(mayReplaceStored(null)).toBe(false);
  });

  it('while a game is open, a kept page opens at once and is not replaced', () => {
    expect(pageAnswerPlan(1, true)).toEqual({ first: 'kept', keepNetworkAnswer: false });
    expect(pageAnswerPlan(null, true)).toEqual({ first: 'kept', keepNetworkAnswer: false });
  });

  it('while a game is open, a page not kept yet comes from the network and is kept', () => {
    expect(pageAnswerPlan(1, false)).toEqual({ first: 'network', keepNetworkAnswer: true });
  });

  it('with no game open, the network first, and its answer replaces the kept page', () => {
    expect(pageAnswerPlan(0, true)).toEqual({ first: 'network', keepNetworkAnswer: true });
    expect(pageAnswerPlan(0, false)).toEqual({ first: 'network', keepNetworkAnswer: true });
  });
});

describe('which pages hold a release back (T-127, T-328): a game in progress open now', () => {
  const live = { gameId: 'g1', state: { state: { status: 'live' } } };
  const final = { gameId: 'g2', state: { state: { status: 'final' } } };
  const notLoaded = { gameId: 'g3', state: null };
  const kept = [live, final, notLoaded];

  it('stored data alone holds nothing back: no page open, nothing waits (review M2)', () => {
    expect(gamesHoldingBack([], kept, [{ gameId: 'g1', state: 'waiting' }])).toBe(0);
    expect(gamesHoldingBack([], null, null)).toBe(0);
    expect(mayReplaceStored(gamesHoldingBack([], kept, []))).toBe(true);
  });

  it('an open page of a game not final holds it back, waiting plays or not', () => {
    expect(gamesHoldingBack(['g1'], kept, [])).toBe(1);
    expect(gamesHoldingBack(['G3'], kept, [])).toBe(1);
    expect(gamesHoldingBack(['g1', 'g3'], kept, [{ gameId: 'g1', state: 'waiting' }])).toBe(2);
    // A page still opening, its game not stored yet, holds it back too.
    expect(gamesHoldingBack(['g9'], kept, [])).toBe(1);
  });

  it('an open page of a final game holds it back only while its plays wait on this device', () => {
    expect(gamesHoldingBack(['g2'], kept, [])).toBe(0);
    expect(gamesHoldingBack(['g2'], kept, [{ gameId: 'g2', state: 'waiting' }])).toBe(1);
    // Plays listed not saved, or refused, wait for nobody: nothing is sent.
    expect(gamesHoldingBack(['g2'], kept, [{ gameId: 'g2', state: 'not-saved' }])).toBe(0);
    expect(gamesHoldingBack(['g2'], kept, [{ gameId: 'g2', state: 'refused' }])).toBe(0);
  });

  it('an open page counts when the store or the queue cannot be read', () => {
    expect(gamesHoldingBack(['g2'], null, [])).toBe(1);
    expect(mayReplaceStored(gamesHoldingBack(['g2'], null, []))).toBe(false);
    expect(gamesHoldingBack(['g2'], kept, null)).toBe(1);
  });
});

describe('who the device says is signed in here (T-327)', () => {
  it('reads the account id of the mark, never anything else', () => {
    expect(deviceAccountOf([{ accountId: 'account-1' }])).toBe('account-1');
    expect(deviceAccountOf([])).toBeNull();
    expect(deviceAccountOf(null)).toBeNull();
    expect(deviceAccountOf([{ accountId: '' }, 'x', null])).toBeNull();
  });
});

describe('the code mark and the scope', () => {
  it('changes with the built files, not with their order or other scripts', () => {
    const one = codeMarkOf([
      'https://s/_next/static/chunks/a.js',
      'https://s/_next/static/chunks/b.js',
    ]);
    expect(
      codeMarkOf(['https://s/_next/static/chunks/b.js', 'https://s/_next/static/chunks/a.js', '']),
    ).toBe(one);
    expect(
      codeMarkOf(['https://s/_next/static/chunks/c.js', 'https://s/_next/static/chunks/b.js']),
    ).not.toBe(one);
    expect(one).toMatch(/^[0-9a-z]+$/);
  });

  it('reaches the folder of the worker: the league tracker addresses', () => {
    expect(trackerScopeOf('/north/score/tracker-worker.js')).toBe('/north/score/');
  });
});

describe('a kept page is the account’s that made it (T-321)', () => {
  const meta = trackerAccountMetaName;
  const html = (account: string) =>
    `<!DOCTYPE html><html><head><meta charSet="utf-8"/><meta name="theme-color" content="#123"/><meta name="${meta}" content="${account}"/></head><body>…</body></html>`;
  const answer = (status: number, more: Partial<{ type: string; redirected: boolean }> = {}) => ({
    status,
    type: 'basic',
    redirected: false,
    ...more,
  });

  it('reads the account a page was made for from its head, and nothing from a page without one', () => {
    expect(accountMarkOfPage(html('account-1'), meta)).toBe('account-1');
    expect(accountMarkOfPage(`<meta content="account-2" name="${meta}">`, meta)).toBe('account-2');
    expect(
      accountMarkOfPage('<html><head><meta name="theme-color" content="#123"/></head>', meta),
    ).toBeNull();
    expect(accountMarkOfPage(`<meta name="${meta}" content=""/>`, meta)).toBeNull();
    // Written in the page's data, not as a tag: not the page's mark.
    expect(
      accountMarkOfPage(`<script>["$","meta",{"name":"${meta}","content":"x"}]</script>`, meta),
    ).toBeNull();
  });

  it('learns who is signed in only from an answer that says it', () => {
    expect(signedInFrom(answer(200), 'account-1')).toBe('account-1');
    // Sent to sign in, or refused as signed out: nobody.
    expect(signedInFrom(answer(200, { redirected: true }), null)).toBeNull();
    expect(signedInFrom(answer(0, { type: 'opaqueredirect' }), null)).toBeNull();
    expect(signedInFrom(answer(403), null)).toBeNull();
    expect(signedInFrom(answer(401), null)).toBeNull();
    // A page that names nobody.
    expect(signedInFrom(answer(200), null)).toBeNull();
    // No answer in time, an error or "not found": the network did not say.
    expect(signedInFrom(null, null)).toBeUndefined();
    expect(signedInFrom(answer(500), null)).toBeUndefined();
    expect(signedInFrom(answer(404), null)).toBeUndefined();
  });

  it('shows a kept page only while its own account is signed in, as the network or the device says', () => {
    expect(mayServeKeptPage('account-1', 'account-1', null)).toBe(true);
    expect(mayServeKeptPage('account-1', 'account-2', 'account-1')).toBe(false);
    expect(mayServeKeptPage('account-1', null, 'account-1')).toBe(false);
    // A kept page that names no account is never shown.
    expect(mayServeKeptPage(null, undefined, null)).toBe(false);
    expect(mayServeKeptPage(null, null, null)).toBe(false);
  });

  it('with no signal, shows a kept page only to the account the device marks as signed in (review M1)', () => {
    expect(mayServeKeptPage('account-1', undefined, 'account-1')).toBe(true);
    // Someone else signed in on another page of the league since: the plain offline page.
    expect(mayServeKeptPage('account-1', undefined, 'account-2')).toBe(false);
    // Nobody marked (signed out, or a device from before this release): not shown.
    expect(mayServeKeptPage('account-1', undefined, null)).toBe(false);
  });
});
