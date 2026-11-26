import { describe, expect, it } from 'vitest';
import {
  gamesHoldingBack,
  accountMarkOfPage,
  keptAddressOf,
  mayReplaceStored,
  mayServeKeptPage,
  pageAnswerPlan,
  signedInFrom,
  mayForgetGamePage,
  mayRenewKeptPage,
  pageCodeOf,
  trackerWorkerForgetGameMessage,
  trackerWorkerRenewGameMessage,
  trackerWorkerForgetMessage,
  trackerWorkerKeepMessage,
  trackerWorkerReleaseMessage,
} from './tracker-worker-rules.ts';
import { trackerWorkerScript } from './tracker-worker-script.ts';

type Rules = {
  readonly keptAddressOf: typeof keptAddressOf;
  readonly mayReplaceStored: typeof mayReplaceStored;
  readonly pageAnswerPlan: typeof pageAnswerPlan;
  readonly accountMarkOfPage: typeof accountMarkOfPage;
  readonly mayServeKeptPage: typeof mayServeKeptPage;
  readonly signedInFrom: typeof signedInFrom;
};

/** Runs the worker's script with a stand-in for the browser, as the browser would. */
function runScript() {
  const listened: string[] = [];
  const self = {
    registration: { scope: 'https://site.test/north/score/' },
    location: { href: 'https://site.test/north/score/tracker-worker.js?code=abc' },
    addEventListener: (type: string) => listened.push(type),
  };
  const run = new Function(
    'self',
    `${trackerWorkerScript()}\nreturn { keptAddressOf, mayReplaceStored, pageAnswerPlan, accountMarkOfPage, mayServeKeptPage, signedInFrom };`,
  ) as (stand: typeof self) => Rules;
  return { rules: run(self), listened };
}

describe("the tracker worker's script (step 2.38)", () => {
  it('is a script the browser can run, listening for what a worker must', () => {
    const { listened } = runScript();
    expect(listened.sort()).toEqual(['activate', 'fetch', 'install', 'message']);
  });

  it('runs the very rules the tests prove', () => {
    const { rules } = runScript();
    const scope = 'https://site.test/north/score/';
    const request = { url: `${scope}g-1?x=1`, method: 'GET', mode: 'navigate' };
    expect(rules.keptAddressOf(request, scope)).toEqual(keptAddressOf(request, scope));
    const other = { url: 'https://site.test/north/admin', method: 'GET', mode: 'navigate' };
    expect(rules.keptAddressOf(other, scope)).toBeNull();
    for (const open of [0, 1, null]) {
      expect(rules.mayReplaceStored(open)).toBe(mayReplaceStored(open));
      expect(rules.pageAnswerPlan(open, true)).toEqual(pageAnswerPlan(open, true));
    }
    // The account rule (T-321).
    const head = '<meta name="srleagues-account" content="account-1"/>';
    expect(rules.accountMarkOfPage(head, 'srleagues-account')).toBe('account-1');
    for (const signedIn of ['account-1', 'account-2', null, undefined]) {
      for (const here of ['account-1', 'account-2', null]) {
        expect(rules.mayServeKeptPage('account-1', signedIn, here)).toBe(
          mayServeKeptPage('account-1', signedIn, here),
        );
      }
    }
    const sentToSignIn = { status: 0, type: 'opaqueredirect', redirected: false };
    expect(rules.signedInFrom(sentToSignIn, null)).toBe(signedInFrom(sentToSignIn, null));
    expect(rules.signedInFrom(null, null)).toBeUndefined();
  });

  it('deletes the kept pages of another account, or of nobody, once the network says who is signed in', () => {
    const script = trackerWorkerScript();
    expect(script).toContain('"accountMeta":"srleagues-account"');
    expect(script).toContain('if (signedIn !== undefined) await forgetPagesNotOf(signedIn);');
    expect(script).toContain(
      'if (kept && !mayServeKeptPage(await accountOf(kept), signedIn, await deviceAccount())) kept = undefined;',
    );
  });

  it('signing out: a copy still being written never lands after the forgetting (T-115)', async () => {
    // The order the browser test found: the reloaded page asks the worker to keep it, the
    // page's fetch is under way, signing out deletes the caches, then the copy landed.
    const boxes = new Map<string, Map<string, unknown>>();
    const box = (name: string) => {
      const found = boxes.get(name) ?? new Map<string, unknown>();
      boxes.set(name, found);
      return {
        put: (key: string, value: unknown) => {
          found.set(String(key), value);
          return Promise.resolve();
        },
        match: (key: string) => Promise.resolve(found.get(String(key))),
        keys: () => Promise.resolve([...found.keys()].map((url) => ({ url }))),
        delete: (key: { url: string }) => Promise.resolve(found.delete(key.url)),
      };
    };
    const caches = {
      open: (name: string) => Promise.resolve(box(name)),
      keys: () => Promise.resolve([...boxes.keys()]),
      delete: (name: string) => Promise.resolve(boxes.delete(name)),
    };
    let answerPage: (answer: unknown) => void = () => undefined;
    const fetch = () => new Promise((done) => (answerPage = done));
    const handlers = new Map<string, (event: unknown) => void>();
    const self = {
      registration: { scope: 'https://site.test/north/score/' },
      location: { href: 'https://site.test/north/score/tracker-worker.js?code=abc' },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
    };
    new Function('self', 'caches', 'fetch', trackerWorkerScript())(self, caches, fetch);
    const pending: Promise<unknown>[] = [];
    const message = (data: unknown, ports: unknown[] = []) =>
      handlers.get('message')?.({
        data,
        ports,
        waitUntil: (p: Promise<unknown>) => pending.push(p),
      });
    message({
      type: trackerWorkerKeepMessage,
      page: 'https://site.test/north/score/g-1',
      code: [],
    });
    await new Promise((done) => setTimeout(done, 0));
    let answered = false;
    message({ type: trackerWorkerForgetMessage }, [{ postMessage: () => (answered = true) }]);
    answerPage({ status: 200, type: 'basic', redirected: false, ok: true });
    await Promise.all(pending);
    expect(answered).toBe(true);
    expect([...boxes.keys()]).toEqual([]);
  });

  it('reads the opened games store and never creates it', () => {
    const script = trackerWorkerScript();
    expect(script).toContain('"database":"srleagues-tracker-games"');
    expect(script).toContain('"games":"games"');
    expect(script).toContain('asking.transaction.abort()');
  });

  it('counts only tracker pages open now, their game in progress (T-328)', () => {
    const script = trackerWorkerScript();
    expect(script).toContain('"queueDatabase":"srleagues-tracker-queue"');
    expect(script).toContain('"queue":"commands"');
    expect(script).toContain('"accountDatabase":"srleagues-device-account"');
    expect(script).toContain(`const gamesHoldingBack = (${String(gamesHoldingBack)});`);
    expect(script).toContain(
      "self.clients.matchAll({ type: 'window', includeUncontrolled: true })",
    );
    expect(script).toContain('if (open.length === 0) return 0;');
  });

  it('"Reload" on "update needed": the kept pages and files go, a waiting worker takes over, the plays stay (T-328)', async () => {
    const boxes = new Map<string, Map<string, unknown>>([
      ['srleagues-tracker https://site.test/north/score/ abc', new Map([['page', 1]])],
      ['srleagues-tracker https://site.test/south/score/ xyz', new Map([['page', 2]])],
    ]);
    const caches = {
      open: () => Promise.reject(new Error('not opened here')),
      keys: () => Promise.resolve([...boxes.keys()]),
      delete: (name: string) => Promise.resolve(boxes.delete(name)),
    };
    const handlers = new Map<string, (event: unknown) => void>();
    let tookOver = false;
    const self = {
      registration: { scope: 'https://site.test/north/score/' },
      location: { href: 'https://site.test/north/score/tracker-worker.js?code=abc' },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
      skipWaiting: () => {
        tookOver = true;
        return Promise.resolve();
      },
    };
    // The worker never opens the device's databases for this: the plays stay where they are.
    const indexedDB = {
      open: () => {
        throw new Error('the release message must not touch the device storage');
      },
    };
    new Function('self', 'caches', 'indexedDB', trackerWorkerScript())(self, caches, indexedDB);
    const pending: Promise<unknown>[] = [];
    let answered = false;
    handlers.get('message')?.({
      data: { type: trackerWorkerReleaseMessage },
      ports: [{ postMessage: () => (answered = true) }],
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    await Promise.all(pending);
    expect(answered).toBe(true);
    expect(tookOver).toBe(true);
    // Only this scope's kept copies go; another league's stay.
    expect([...boxes.keys()]).toEqual(['srleagues-tracker https://site.test/south/score/ xyz']);
  });
});

/** A stand-in for the browser's answers, caches and stores, for the worker's own text. */
type Answer = {
  readonly status: number;
  readonly type: string;
  readonly redirected: boolean;
  clone: () => Answer;
  text: () => Promise<string>;
};
const answerOf = (text: string, status = 200): Answer => ({
  status,
  type: 'basic',
  redirected: false,
  clone: () => answerOf(text, status),
  text: () => Promise.resolve(text),
});
const scope = 'https://site.test/north/score/';
const current = `srleagues-tracker ${scope} abc`;
const pageOf = (game: string) => `${scope}${game}`;
const html = (account: string, body: string, script: string) =>
  `<meta name="srleagues-account" content="${account}"><script src="${script}"></script>${body}`;

function browserStandIn(
  kept: Record<string, Answer>,
  network: (url: string) => Answer,
  queued: readonly unknown[],
) {
  const boxes = new Map<string, Map<string, Answer>>([[current, new Map(Object.entries(kept))]]);
  const keyOf = (key: string | { url: string }) => (typeof key === 'string' ? key : key.url);
  const box = (name: string) => {
    const found = boxes.get(name) ?? new Map<string, Answer>();
    boxes.set(name, found);
    return {
      put: (key: string, value: Answer) => Promise.resolve(void found.set(keyOf(key), value)),
      match: (key: string | { url: string }) => Promise.resolve(found.get(keyOf(key))),
      keys: () => Promise.resolve([...found.keys()].map((url) => ({ url }))),
      delete: (key: string | { url: string }) => Promise.resolve(found.delete(keyOf(key))),
    };
  };
  const caches = {
    open: (name: string) => Promise.resolve(box(name)),
    keys: () => Promise.resolve([...boxes.keys()]),
    delete: (name: string) => Promise.resolve(boxes.delete(name)),
  };
  // Only the queue's store has records; every other store reads as empty.
  const indexedDB = {
    open: (database: string) => {
      const rows = database === 'srleagues-tracker-queue' ? queued : [];
      const asking: { result?: unknown; onsuccess?: () => void } = {};
      setTimeout(() => {
        const reading: { result?: unknown; onsuccess?: () => void } = {};
        asking.result = {
          objectStoreNames: { contains: () => true },
          close: () => undefined,
          transaction: () => ({
            objectStore: () => ({
              getAll: () => {
                setTimeout(() => {
                  reading.result = rows;
                  reading.onsuccess?.();
                }, 0);
                return reading;
              },
            }),
          }),
        };
        asking.onsuccess?.();
      }, 0);
      return asking;
    },
  };
  const handlers = new Map<string, (event: unknown) => void>();
  const self = {
    registration: { scope },
    location: { href: `${scope}tracker-worker.js?code=abc` },
    // Which pages are open cannot be read: every open page holds a release back.
    clients: { matchAll: () => Promise.reject(new Error('not read here')) },
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, handler),
  };
  const fetch = (url: string | { url: string }) => Promise.resolve(network(keyOf(url)));
  new Function('self', 'caches', 'indexedDB', 'fetch', trackerWorkerScript())(
    self,
    caches,
    indexedDB,
    fetch,
  );
  const pending: Promise<unknown>[] = [];
  const settled = async () => {
    for (let i = 0; i < pending.length; i += 1) await pending[i];
  };
  return {
    keptNow: (key: string) => boxes.get(current)?.get(key),
    async open(game: string) {
      const answered: { shown?: Promise<Answer> } = {};
      handlers.get('fetch')?.({
        request: { url: pageOf(game), method: 'GET', mode: 'navigate' },
        resultingClientId: 'tab',
        respondWith: (answer: Promise<Answer>) => (answered.shown = answer),
        waitUntil: (p: Promise<unknown>) => pending.push(p),
      });
      if (answered.shown === undefined) throw new Error('not answered');
      const text = await (await answered.shown).text();
      await settled();
      return text;
    },
    async message(data: unknown) {
      handlers.get('message')?.({
        data,
        ports: [],
        waitUntil: (p: Promise<unknown>) => pending.push(p),
      });
      await settled();
    },
  };
}

describe("the tracker worker's kept page of a game (T-487, T-488)", () => {
  const newCode = 'https://site.test/_next/static/chunks/new.js';

  it('names the code a page starts with, made whole', () => {
    expect(
      pageCodeOf(
        '<script src="/_next/static/a.js?x=1&amp;y=2"></script><link rel="stylesheet" href="/display.css"><link rel="icon" href="/i.png">',
        pageOf('g-1'),
      ),
    ).toEqual(['https://site.test/_next/static/a.js?x=1&y=2', 'https://site.test/display.css']);
  });

  it('a page fetched fresh replaces the kept one, its code kept first', async () => {
    const world = browserStandIn(
      { [pageOf('g-1')]: answerOf(html('acc-1', 'Ned Hawkins', '/_next/static/chunks/old.js')) },
      (url) => (url === newCode ? answerOf('code') : answerOf(html('acc-1', 'Ned H.', newCode))),
      [],
    );
    // Shown kept (a game is open), then replaced by the fresh page.
    expect(await world.open('g-1')).toContain('Hawkins');
    expect(await world.keptNow(pageOf('g-1'))?.text()).toContain('Ned H.');
    expect(world.keptNow(newCode)).toBeDefined();
  });

  it('keeps the kept page when the fresh one names code that cannot be fetched', async () => {
    const missing = browserStandIn(
      { [pageOf('g-1')]: answerOf(html('acc-1', 'Ned Hawkins', '/_next/static/chunks/old.js')) },
      (url) => (url === newCode ? answerOf('', 404) : answerOf(html('acc-1', 'Ned H.', newCode))),
      [],
    );
    await missing.open('g-1');
    expect(await missing.keptNow(pageOf('g-1'))?.text()).toContain('Hawkins');
  });

  it("drops a forgotten game's page, and only its (T-488)", async () => {
    const world = browserStandIn(
      { [pageOf('g-1')]: answerOf('one'), [pageOf('g-2')]: answerOf('two') },
      () => answerOf('', 404),
      [{ gameId: 'G-2', state: 'waiting' }],
    );
    await world.message({ type: trackerWorkerForgetGameMessage, page: pageOf('g-1') });
    expect(world.keptNow(pageOf('g-1'))).toBeUndefined();
    expect(world.keptNow(pageOf('g-2'))).toBeDefined();
  });

  it('never drops it while a tap of the game waits or is set aside (T-488)', async () => {
    for (const state of ['waiting', 'not-saved']) {
      const world = browserStandIn({ [pageOf('g-1')]: answerOf('one') }, () => answerOf('', 404), [
        { gameId: 'G-1', state },
      ]);
      await world.message({ type: trackerWorkerForgetGameMessage, page: pageOf('g-1') });
      expect(world.keptNow(pageOf('g-1'))).toBeDefined();
    }
    expect(mayForgetGamePage('g-1', null)).toBe(false);
    expect(mayForgetGamePage('g-1', [{ gameId: 'g-2', state: 'waiting' }])).toBe(true);
  });

  it('asked by the page, replaces the kept page with one fetched fresh for the same account (T-489)', async () => {
    const world = browserStandIn(
      { [pageOf('g-1')]: answerOf(html('acc-1', 'Ned Hawkins', '/_next/static/chunks/old.js')) },
      (url) => (url === newCode ? answerOf('code') : answerOf(html('acc-1', 'Ned H.', newCode))),
      [{ gameId: 'G-1', state: 'waiting' }],
    );
    await world.message({ type: trackerWorkerRenewGameMessage, page: pageOf('g-1') });
    // Replaced though a tap of the game waits: the page is still kept, its names fresh.
    const text = await world.keptNow(pageOf('g-1'))?.text();
    expect(text).toContain('Ned H.');
    expect(text).not.toContain('Hawkins');
    expect(world.keptNow(newCode)).toBeDefined();
  });

  it("asked by the page, keeps the kept page when the fresh one fails or is another account's, and keeps none it had not (T-489)", async () => {
    for (const fresh of [answerOf('', 503), answerOf(html('acc-2', 'Ned H.', newCode))]) {
      const world = browserStandIn(
        { [pageOf('g-1')]: answerOf(html('acc-1', 'Ned Hawkins', '/_next/static/chunks/old.js')) },
        (url) => (url === newCode ? answerOf('code') : fresh),
        [],
      );
      await world.message({ type: trackerWorkerRenewGameMessage, page: pageOf('g-1') });
      expect(await world.keptNow(pageOf('g-1'))?.text()).toContain('Ned Hawkins');
    }
    const none = browserStandIn({}, () => answerOf(html('acc-1', 'Ned H.', newCode)), []);
    await none.message({ type: trackerWorkerRenewGameMessage, page: pageOf('g-1') });
    expect(none.keptNow(pageOf('g-1'))).toBeUndefined();
    expect(mayRenewKeptPage(null, null)).toBe(false);
    expect(mayRenewKeptPage('acc-1', 'acc-1')).toBe(true);
  });
});
