import { describe, expect, it } from 'vitest';
import { noticeOf } from './notice.ts';

describe('noticeOf', () => {
  it('says a plain refusal was not saved', () => {
    expect(noticeOf({ problem: 'invalid-input' })?.text).toMatch(/not saved/);
  });
  it('says the move was saved when only the recording change was refused', () => {
    const notice = noticeOf({ problem: 'invalid-input', partial: '1' });
    expect(notice?.kind).toBe('problem');
    expect(notice?.text).toMatch(/were saved to the draft/);
  });
});
