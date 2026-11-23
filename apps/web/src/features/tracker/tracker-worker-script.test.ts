import { describe, expect, it } from 'vitest';
import { keptAddressOf, mayReplaceStored, pageAnswerPlan } from './tracker-worker-rules.ts';
import { trackerWorkerScript } from './tracker-worker-script.ts';

type Rules = {
  readonly keptAddressOf: typeof keptAddressOf;
  readonly mayReplaceStored: typeof mayReplaceStored;
  readonly pageAnswerPlan: typeof pageAnswerPlan;
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
    `${trackerWorkerScript()}\nreturn { keptAddressOf, mayReplaceStored, pageAnswerPlan };`,
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
  });

  it('reads the opened games store and never creates it', () => {
    const script = trackerWorkerScript();
    expect(script).toContain('"database":"srleagues-tracker-games"');
    expect(script).toContain('"games":"games"');
    expect(script).toContain('asking.transaction.abort()');
  });
});
