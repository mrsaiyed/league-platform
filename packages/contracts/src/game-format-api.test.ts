// The format endpoint's contract (step 2.119): each answer's status, and a caller takes a
// reply as the server's own only with its body at its own status.
import { describe, expect, it } from 'vitest';
import {
  GameFormatChangeRequest,
  gameFormatRefusals,
  gameFormatStatus,
  ownGameFormatReply,
} from './game-format-api.ts';

describe('the game format contract', () => {
  it('sends each refusal at its own status', () => {
    const statuses = gameFormatRefusals.map((code) =>
      gameFormatStatus({ status: 'refused', code, sentAt: 0 }),
    );
    expect(statuses).toEqual([403, 404, 409, 409, 409, 409, 409, 409]);
  });

  it('takes a reply as the server’s only at its own status', () => {
    const body = { status: 'refused', code: 'under-way', sentAt: 1 };
    expect(ownGameFormatReply(409, body)).toEqual(body);
    expect(ownGameFormatReply(200, body)).toBeNull();
    expect(ownGameFormatReply(409, { status: 'refused', code: 'other', sentAt: 1 })).toBeNull();
  });

  it('takes null for the season’s format and refuses anything else that is not a format', () => {
    expect(GameFormatChangeRequest.safeParse({ version: 3, format: null }).success).toBe(true);
    expect(GameFormatChangeRequest.safeParse({ version: 3, format: {} }).success).toBe(false);
    expect(GameFormatChangeRequest.safeParse({ version: 3 }).success).toBe(false);
  });
});
