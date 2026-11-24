// The takeover question and "Send these plays" as they are drawn (step 2.148): the
// words come from the tracker's own catalog, so what is checked is what a person reads.
import { createTranslator, en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LastHeard, minutesSince, SendNotSaved, takeOverQuestionText } from './take-over-parts.tsx';
import { trackerCatalog } from './tracker-catalog.ts';
import { trackerNoticeText, trackerNotices } from './tracker-notice.ts';
import type { TrackerControllerStatus } from './tracker-controller.ts';

const t = createTranslator('en', { en: trackerCatalog(en) });
const none = () => undefined;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const minute = 60_000;
const heardAt = Date.UTC(2026, 10, 24, 19, 0);

describe('when the holder’s device was last heard from (S-42)', () => {
  it('says whole minutes on the server’s clock, never below nought', () => {
    expect(minutesSince(heardAt, heardAt + 10 * minute + 59_000)).toBe(10);
    expect(minutesSince(heardAt, heardAt - 5_000)).toBe(0);
  });

  it('reads "10 minutes ago", "1 minute ago" and "less than a minute ago", and nothing when unknown', () => {
    const at = (ms: number) =>
      text(renderToStaticMarkup(createElement(LastHeard, { lastHeardAt: heardAt, now: ms, t })));
    expect(at(heardAt + 10 * minute)).toBe('That device was last heard from 10 minutes ago.');
    expect(at(heardAt + minute)).toBe('That device was last heard from 1 minute ago.');
    expect(at(heardAt + 20_000)).toBe('That device was last heard from less than a minute ago.');
    expect(
      renderToStaticMarkup(createElement(LastHeard, { lastHeardAt: undefined, now: heardAt, t })),
    ).toBe('');
  });
});

describe('the takeover question (S-42)', () => {
  it('names who was scoring, or says "you, on another device" by the server’s mark only', () => {
    expect(takeOverQuestionText({ name: 'Sam Lee', sameAccount: false }, t)).toMatch(
      /^Take over scoring from Sam Lee\? /,
    );
    // The same name on the mark's side changes nothing: only the mark says it is you.
    const self = takeOverQuestionText({ name: 'Sam Lee', sameAccount: true }, t);
    expect(self).toMatch(/^Take over scoring from you, on another device\? /);
    expect(self).not.toContain('Sam Lee');
  });

  it('the notice above it says the same: another person by name, or you on another device', () => {
    const status = (sameAccount: boolean) =>
      ({
        mode: {
          kind: 'held-by-other',
          holder: { displayName: 'Sam Lee', since: 'x', lastHeardAt: heardAt, sameAccount },
        },
        game: null,
        notApplied: [],
        notSaved: [],
        signedOut: false,
        waiting: [],
        offlineLong: false,
      }) as unknown as TrackerControllerStatus;
    const said = (sameAccount: boolean) =>
      trackerNotices(status(sameAccount)).map((n) => trackerNoticeText(n, t));
    expect(said(false)).toEqual(['Sam Lee is scoring this game on another device.']);
    expect(said(true)).toEqual(['You are scoring this game on another device.']);
  });
});

describe('send these plays (S-43)', () => {
  const drawn = (offer: 'none' | 'offered' | 'sending' | 'game-moved', busy = false) =>
    renderToStaticMarkup(createElement(SendNotSaved, { offer, busy, onSend: none, t }));

  it('is a button only while offered, says it is sending, and nothing when not offered', () => {
    expect(drawn('none')).toBe('');
    expect(drawn('offered')).toContain('data-send-plays=""');
    expect(text(drawn('offered'))).toBe('Send these plays');
    expect(drawn('offered')).not.toContain('disabled');
    expect(text(drawn('sending'))).toBe('Sending…');
    expect(drawn('sending')).toContain('disabled');
    expect(drawn('offered', true)).toContain('disabled');
  });

  it('says the device could not tell whether somebody else scored, beside the offer (step 2.242)', () => {
    const told = (offer: 'none' | 'offered' | 'game-moved') =>
      renderToStaticMarkup(
        createElement(SendNotSaved, { offer, busy: false, onSend: none, t, cannotTell: true }),
      );
    const said =
      'This device could not tell whether somebody else scored in this game since these plays were made, so it did not send them. A play is never counted twice.';
    expect(told('offered')).toContain('data-cannot-tell=""');
    expect(told('offered')).toContain('data-send-plays=""');
    expect(text(told('offered'))).toBe(`${said} Send these plays`);
    expect(text(told('none'))).toBe(said);
    expect(told('game-moved')).not.toContain('<button');
    expect(drawn('offered')).not.toContain('data-cannot-tell');
  });

  it('once the server refused them, offers no button and says each is entered again', () => {
    expect(drawn('game-moved')).not.toContain('<button');
    expect(text(drawn('game-moved'))).toBe(
      'These plays could not be sent: something was recorded in this game since they were made. Each one must be entered again on the device scoring the game.',
    );
  });
});
