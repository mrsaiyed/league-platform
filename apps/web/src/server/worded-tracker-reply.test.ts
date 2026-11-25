import { describe, expect, it } from 'vitest';
import { wordedTrackerReply } from './worded-tracker-reply.ts';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('wordedTrackerReply (step 2.241, T-187)', () => {
  it('words each refusal of a statistic not kept, whatever its code, and drops the plain data', () => {
    const reply = wordedTrackerReply({
      protocolVersion: 2,
      sequence: 3,
      results: [
        { commandId: id(1), status: 'accepted' },
        {
          commandId: id(2),
          status: 'refused',
          reason: { code: 'statistic-not-kept', message: '' },
        },
        { commandId: id(3), status: 'refused', reason: { code: 'rule', message: '' } },
        { commandId: id(4), status: 'refused', reason: { code: 'rule', message: 'Not on court.' } },
        { commandId: id(5), status: 'refused', reason: { code: 'rule', message: '' } },
      ],
      notKept: { [id(2)]: 'turnovers', [id(3)]: 'turnovers', [id(5)]: 'steals' },
    });
    expect(reply).toEqual({
      protocolVersion: 2,
      sequence: 3,
      results: [
        { commandId: id(1), status: 'accepted' },
        {
          commandId: id(2),
          status: 'refused',
          reason: { code: 'statistic-not-kept', message: 'This season does not keep turnovers.' },
        },
        {
          commandId: id(3),
          status: 'refused',
          reason: { code: 'rule', message: 'This season does not keep turnovers.' },
        },
        { commandId: id(4), status: 'refused', reason: { code: 'rule', message: 'Not on court.' } },
        {
          commandId: id(5),
          status: 'refused',
          reason: { code: 'rule', message: 'This season does not keep this statistic.' },
        },
      ],
    });
  });

  it('leaves a reply with nothing refused for that as it is', () => {
    const plain = {
      protocolVersion: 2,
      sequence: 1,
      results: [{ commandId: id(1), status: 'duplicate' as const }],
    };
    expect(wordedTrackerReply(plain)).toEqual(plain);
  });
});
