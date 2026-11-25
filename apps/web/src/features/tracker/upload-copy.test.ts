import { gameCopyUploadRefusals } from '@srleagues/contracts';
import { createTranslator } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { uploadBody, uploadedLines, uploadViewOf } from './upload-copy.ts';

const t = createTranslator('en');
const copy = '{"format":"game-copy"}';

describe('the upload page of a copy of a game', () => {
  it('posts the file as it is, and the holder agreed to once the question is answered', () => {
    expect(JSON.parse(uploadBody(copy))).toEqual({ copy });
    expect(JSON.parse(uploadBody(copy, { since: 1234 }))).toEqual({
      copy,
      takeOver: { expectedHolderSince: 1234 },
    });
  });

  it('reads the counts, the takeover question and each refusal from the answer', () => {
    expect(
      uploadViewOf(200, { status: 'uploaded', added: 3, alreadyThere: 1, notTaken: 0 }, copy),
    ).toEqual({ kind: 'uploaded', added: 3, alreadyThere: 1, notTaken: 0 });
    const holder = { displayName: 'Sam Keeper', since: 5, lastHeardAt: 9 };
    expect(uploadViewOf(200, { status: 'held-by-other', holder, sentAt: 10 }, copy)).toEqual({
      kind: 'held-by-other',
      holder,
      sentAt: 10,
      copy,
    });
    for (const code of gameCopyUploadRefusals) {
      expect(uploadViewOf(422, { status: 'refused', code }, copy)).toEqual({
        kind: 'refused',
        code,
      });
      // Every refusal has its own plain words.
      expect(t(`tracker.copy.refused.${code}`)).not.toBe(`tracker.copy.refused.${code}`);
    }
  });

  it("reads the league's own refusals and an answer it does not know", () => {
    expect(uploadViewOf(401, { error: 'signed-out' }, copy)).toEqual({ kind: 'signed-out' });
    expect(uploadViewOf(403, { error: 'not-allowed' }, copy)).toEqual({
      kind: 'refused',
      code: 'not-allowed',
    });
    // The gate's 404 (a hidden league is answered as a missing one): sign in (T-453).
    expect(uploadViewOf(404, null, copy)).toEqual({ kind: 'signed-out' });
    expect(uploadViewOf(502, null, copy)).toEqual({ kind: 'failed' });
    // A body too large for the server, in its own words (step 2.70, fix round).
    expect(uploadViewOf(413, { error: 'too-large' }, copy)).toEqual({ kind: 'too-large' });
    expect(uploadViewOf(413, null, copy)).toEqual({ kind: 'too-large' });
    expect(uploadViewOf(200, { status: 'uploaded', added: -1 }, copy)).toEqual({ kind: 'failed' });
  });

  it('says what was new, what the server had and what was not taken', () => {
    expect(uploadedLines({ kind: 'uploaded', added: 3, alreadyThere: 0, notTaken: 0 }, t)).toEqual([
      'The copy is uploaded.',
      '3 plays were new: they are saved now.',
    ]);
    expect(uploadedLines({ kind: 'uploaded', added: 0, alreadyThere: 1, notTaken: 2 }, t)).toEqual([
      'The copy is uploaded.',
      'No play in the copy was new.',
      'The server already had 1 play, so it was not counted again.',
      '2 plays were not taken: the game’s rules refused them, or another device took the game while the copy was being sent.',
    ]);
    expect(uploadedLines({ kind: 'uploaded', added: 0, alreadyThere: 0, notTaken: 0 }, t)).toEqual([
      'The copy held no plays: there was nothing to send.',
    ]);
  });

  it('says apart the plays of a statistic the season does not keep, and where to change it (T-395)', () => {
    const reply = {
      status: 'uploaded',
      added: 2,
      alreadyThere: 0,
      notTaken: 1,
      notKept: [
        { statistic: 'turnovers', count: 2 },
        { statistic: 'steals', count: 1 },
      ],
    };
    const view = uploadViewOf(200, reply, copy);
    expect(view).toEqual({
      kind: 'uploaded',
      added: 2,
      alreadyThere: 0,
      notTaken: 1,
      notKept: reply.notKept,
    });
    if (view.kind !== 'uploaded') throw new Error('not uploaded');
    expect(uploadedLines(view, t)).toEqual([
      'The copy is uploaded.',
      '2 plays were new: they are saved now.',
      '1 play was not taken: the game’s rules refused it, or another device took the game while the copy was being sent.',
      '2 turnovers were not taken: this season does not keep turnovers. An admin can change that in “Statistics kept”.',
      '1 play was not taken: this season does not keep its statistic. An admin can change that in “Statistics kept”.',
    ]);
    const one = { kind: 'uploaded', added: 0, alreadyThere: 0, notTaken: 0 } as const;
    expect(uploadedLines({ ...one, notKept: [{ statistic: 'turnovers', count: 1 }] }, t)).toEqual([
      'The copy is uploaded.',
      'No play in the copy was new.',
      '1 turnover was not taken: this season does not keep turnovers. An admin can change that in “Statistics kept”.',
    ]);
  });
});
