// The isolation registry keeps each case once, tied to the function it runs.
import { describe, expect, it } from 'vitest';
import {
  registerIsolationCase,
  registeredIsolationCases,
  type IsolationCase,
} from './isolation-registry.test-helper.ts';

const listNothing = async () => [];

describe('registerIsolationCase', () => {
  it('keeps cases in the order registered, frozen', () => {
    const first: IsolationCase = { subject: listNothing, name: 'first', run: listNothing };
    const second: IsolationCase = { subject: listNothing, name: 'second', run: listNothing };
    registerIsolationCase(first);
    registerIsolationCase(second);
    const cases = registeredIsolationCases();
    expect(cases.map((c) => [c.subject, c.name])).toEqual([
      [listNothing, 'first'],
      [listNothing, 'second'],
    ]);
    expect(Object.isFrozen(cases[0])).toBe(true);
  });

  it('refuses the same subject and name twice', () => {
    expect(() =>
      registerIsolationCase({ subject: listNothing, name: 'first', run: listNothing }),
    ).toThrow('Isolation case registered twice: listNothing: first');
  });

  it('hands out a copy of the list', () => {
    const copy = registeredIsolationCases() as IsolationCase[];
    copy.length = 0;
    expect(registeredIsolationCases()).toHaveLength(2);
  });
});
