import { describe, expect, it } from 'vitest';
import {
  accountMarkOfPage,
  keptAddressOf,
  mayReplaceStored,
  mayServeKeptPage,
  pageAnswerPlan,
  signedInFrom,
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
      expect(rules.mayServeKeptPage('account-1', signedIn)).toBe(
        mayServeKeptPage('account-1', signedIn),
      );
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
      'if (kept && !mayServeKeptPage(await accountOf(kept), signedIn)) kept = undefined;',
    );
  });

  it('reads the opened games store and never creates it', () => {
    const script = trackerWorkerScript();
    expect(script).toContain('"database":"srleagues-tracker-games"');
    expect(script).toContain('"games":"games"');
    expect(script).toContain('asking.transaction.abort()');
  });
});
