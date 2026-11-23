import { describe, expect, it } from 'vitest';
import {
  codeMarkOf,
  keptAddressOf,
  mayKeepAnswer,
  mayReplaceStored,
  pageAnswerPlan,
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
