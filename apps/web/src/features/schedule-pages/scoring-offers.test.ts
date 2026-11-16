// Step 2.153: a page's lists of games ask for their "Score this game" buttons through one
// reader, so the page reads once for all of them, never asks twice about a game, and is left
// as it came when the read fails or its answer is not one it understands.
import { describe, expect, it } from 'vitest';
import {
  offersAskedAtOnce,
  offerWhich,
  scoringOfferReply,
  sharedScoringOffers,
  type PageOffers,
  type ReadOffers,
  type ScoringOfferReply,
} from './scoring-offers.ts';

const words = {
  score: 'Score this game',
  enter: 'Enter the score',
  which: '{away} against {home}',
};
const address = '/api/v1/leagues/made-up/scoring';

/** A reader that answers "score" for every game whose id starts with "s", and keeps the asks. */
function reader(answer: (ids: readonly string[]) => ScoringOfferReply | null = scoreS) {
  const asks: (readonly string[])[] = [];
  const read: ReadOffers = async (_address, ids) => {
    asks.push(ids);
    return answer(ids);
  };
  return { read, asks };
}
function scoreS(ids: readonly string[]): ScoringOfferReply {
  const games = ids
    .filter((id) => id.startsWith('s'))
    .map((gameId) => ({ gameId, kind: 'score' as const, href: `/made-up/score/${gameId}` }));
  return games.length === 0 ? { games } : { games, words };
}

/** Runs the reads handed to later, and lets their answers arrive. */
function laterQueue() {
  const runs: (() => void)[] = [];
  return {
    later: (run: () => void) => void runs.push(run),
    async settle() {
      for (const run of runs.splice(0)) run();
      await new Promise((done) => setTimeout(done, 0));
    },
  };
}

const ids = (known: PageOffers | undefined) => [...(known?.offers.keys() ?? [])];

describe('the page’s one reader of its scoring buttons', () => {
  it('reads once for every list drawn together, and tells each list', async () => {
    const { read, asks } = reader();
    const queue = laterQueue();
    const shared = sharedScoringOffers(read, queue.later);
    let first: PageOffers | undefined;
    let second: PageOffers | undefined;
    shared.ask(address, ['s1', 'x2'], (known) => (first = known));
    shared.ask(address, ['x2', 's3'], (known) => (second = known));
    await queue.settle();
    expect(asks).toEqual([['s1', 'x2', 's3']]);
    expect(ids(first)).toEqual(['s1', 's3']);
    expect(ids(second)).toEqual(['s1', 's3']);
    expect(first?.words).toEqual(words);
  });

  it('asks a list that comes later only about games it has not asked already', async () => {
    const { read, asks } = reader();
    const queue = laterQueue();
    const shared = sharedScoringOffers(read, queue.later);
    shared.ask(address, ['s1'], () => {});
    await queue.settle();
    let late: PageOffers | undefined;
    shared.ask(address, ['s1', 's4'], (known) => (late = known));
    // What is known already is given at once.
    expect(ids(late)).toEqual(['s1']);
    await queue.settle();
    expect(asks).toEqual([['s1'], ['s4']]);
    expect(ids(late)).toEqual(['s1', 's4']);
  });

  it('asks in pieces no bigger than the read takes', async () => {
    const { read, asks } = reader();
    const queue = laterQueue();
    const shared = sharedScoringOffers(read, queue.later);
    const many = Array.from({ length: offersAskedAtOnce + 3 }, (_, n) => `s${n}`);
    let known: PageOffers | undefined;
    shared.ask(address, many, (k) => (known = k));
    await queue.settle();
    expect(asks.map((a) => a.length)).toEqual([offersAskedAtOnce, 3]);
    expect(ids(known)).toHaveLength(offersAskedAtOnce + 3);
  });

  it('leaves the page as it came when the read fails, and tells nobody of no games', async () => {
    for (const answer of [() => null, () => Promise.reject(new Error('offline')), scoreS]) {
      const read: ReadOffers = async (_a, asked) => answer(asked);
      const queue = laterQueue();
      const shared = sharedScoringOffers(read, queue.later);
      let told = 0;
      shared.ask(address, ['x1', 'x2'], () => (told += 1));
      await queue.settle();
      expect(told).toBe(0);
    }
  });

  it('stops telling a list that has gone', async () => {
    const { read } = reader();
    const queue = laterQueue();
    const shared = sharedScoringOffers(read, queue.later);
    let told = 0;
    const stop = shared.ask(address, ['s1'], () => (told += 1));
    stop();
    await queue.settle();
    expect(told).toBe(0);
  });

  it('takes only an answer it understands, leading only to this site', () => {
    const offer = { gameId: 'g', kind: 'score' };
    expect(scoringOfferReply.safeParse({ games: [{ ...offer, href: '/a/score/g' }] }).success).toBe(
      true,
    );
    for (const href of ['https://elsewhere.example/x', '//elsewhere.example/x', 'javascript:x']) {
      expect(scoringOfferReply.safeParse({ games: [{ ...offer, href }] }).success, href).toBe(
        false,
      );
    }
    expect(
      scoringOfferReply.safeParse({ games: [{ ...offer, kind: 'other', href: '/a' }] }).success,
    ).toBe(false);
  });

  it('names the game for a screen reader', () => {
    expect(offerWhich(words, 'Hawks', 'Bears')).toBe('Hawks against Bears');
  });
});
