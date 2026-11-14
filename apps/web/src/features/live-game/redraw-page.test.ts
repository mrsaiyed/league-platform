// Drawing a game's page again (step 2.45, record 051): spread over 0 to 5 seconds, only
// when the page answers, and once per sequence number, so a stale page cannot loop.
import { describe, expect, it } from 'vitest';
import { redrawPage, type RedrawDevice } from './redraw-page.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function device(options: { random?: number; answers?: boolean | 'throws'; storage?: 'refuses' }) {
  const stored = new Map<string, string>();
  const waits: number[] = [];
  let pending: (() => void) | undefined;
  let reloads = 0;
  let asked = 0;
  const d: RedrawDevice = {
    random: () => options.random ?? 0.5,
    setTimeout: (run, ms) => {
      waits.push(ms);
      pending = run;
      return 1;
    },
    clearTimeout: () => void (pending = undefined),
    pageAnswers: async () => {
      asked += 1;
      if (options.answers === 'throws') throw new Error('offline');
      return options.answers ?? true;
    },
    reload: () => void (reloads += 1),
    storage: () =>
      options.storage === 'refuses'
        ? {
            getItem: () => {
              throw new Error('refused');
            },
            setItem: () => {
              throw new Error('refused');
            },
          }
        : {
            getItem: (key) => stored.get(key) ?? null,
            setItem: (key, value) => void stored.set(key, value),
          },
  };
  return {
    d,
    waits,
    fire: async () => {
      const run = pending;
      pending = undefined;
      run?.();
      await settle();
    },
    reloads: () => reloads,
    asked: () => asked,
  };
}

describe('drawing a game page again', () => {
  it('waits a random part of 5 seconds, then reloads when the page answers', async () => {
    const x = device({ random: 0.5 });
    redrawPage({ gameId: 'g', sequence: 4 }, x.d);
    expect(x.waits).toEqual([2_500]);
    expect(x.reloads()).toBe(0);
    await x.fire();
    expect(x.asked()).toBe(1);
    expect(x.reloads()).toBe(1);
  });

  it('keeps the page as it is when the page does not answer OK', async () => {
    for (const answers of [false, 'throws'] as const) {
      const x = device({ answers });
      redrawPage({ gameId: 'g', sequence: 4 }, x.d);
      await x.fire();
      expect(x.reloads()).toBe(0);
    }
  });

  it('reloads only once for one sequence number', async () => {
    const x = device({});
    redrawPage({ gameId: 'g', sequence: 4 }, x.d);
    await x.fire();
    redrawPage({ gameId: 'g', sequence: 4 }, x.d); // the reloaded page came back stale
    await x.fire();
    expect(x.reloads()).toBe(1);
    redrawPage({ gameId: 'g', sequence: 5 }, x.d);
    await x.fire();
    expect(x.reloads()).toBe(2);
  });

  it('still reloads when the session storage refuses', async () => {
    const x = device({ storage: 'refuses' });
    redrawPage({ gameId: 'g', sequence: 4 }, x.d);
    await x.fire();
    expect(x.reloads()).toBe(1);
  });

  it('does nothing once cancelled', async () => {
    const x = device({});
    const cancel = redrawPage({ gameId: 'g', sequence: 4 }, x.d);
    cancel();
    await x.fire();
    expect(x.reloads()).toBe(0);
  });
});
