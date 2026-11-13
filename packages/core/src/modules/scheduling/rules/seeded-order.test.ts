import { describe, expect, it } from 'vitest';
import { seededNumbers, seededOrder } from './seeded-order.ts';

describe('seededOrder', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('keeps the order given for seed 0', () => {
    expect(seededOrder(items, 0)).toEqual(items);
  });

  it('gives the same order for the same seed and never changes its input', () => {
    const copy = [...items];
    expect(seededOrder(items, 7)).toEqual(seededOrder(items, 7));
    expect(items).toEqual(copy);
  });

  it('keeps every item exactly once and differs between seeds', () => {
    const orders = [1, 2, 3, 4, 5].map((s) => seededOrder(items, s));
    for (const order of orders) expect([...order].sort()).toEqual(items);
    expect(new Set(orders.map((o) => o.join(''))).size).toBeGreaterThan(1);
  });

  it('gives numbers from 0 up to 1', () => {
    const next = seededNumbers(42);
    for (let i = 0; i < 1000; i++) {
      const n = next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});
