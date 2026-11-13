// A repeatable shuffle for "generate again" (P7 §4.2): the same number always gives the same
// order on every machine, so a schedule can be produced again from its inputs.

/** A source of numbers from 0 up to but not including 1 (mulberry32: tiny, fast, portable). */
export function seededNumbers(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The items in an order chosen by `seed`. Seed 0 keeps the order given. The input is never changed. */
export function seededOrder<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  if (seed === 0) return out;
  const next = seededNumbers(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
