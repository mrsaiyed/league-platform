import { leagueStatuses } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { leagueStatusOf } from './league-status-of.ts';

describe('leagueStatusOf', () => {
  it("accepts exactly core's league states", () => {
    for (const status of leagueStatuses) expect(leagueStatusOf(status)).toBe(status);
    for (const bad of ['', 'Live', 'deleted']) expect(() => leagueStatusOf(bad)).toThrow();
  });
});
