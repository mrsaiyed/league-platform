// The bot check's widget in a sign-in form (record 081): what each kind draws.
import {
  createBotCheckOff,
  createLocalBotCheck,
  createTurnstileBotCheck,
} from '@srleagues/providers';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { t } from '../../server/messages.ts';
import { problems } from '../../server/sign-in/problems.ts';
import { BotCheckField, fieldRefusal, needsScriptsWords, problemWords } from './sign-in-parts.tsx';

const draw = (
  widget: Parameters<typeof BotCheckField>[0]['widget'],
  action: Parameters<typeof BotCheckField>[0]['action'] = 'sign-up',
  google = false,
) => renderToStaticMarkup(createElement(BotCheckField, { widget, action, google }));

describe('BotCheckField', () => {
  it('draws nothing when the check is off (staging without its keys, T-270)', () => {
    expect(draw(createBotCheckOff().widget)).toBe('');
  });

  it("draws the stand-in's hidden answer", () => {
    expect(draw(createLocalBotCheck({ appEnv: 'test' }).widget)).toBe(
      '<input type="hidden" name="cf-turnstile-response" value="local-bot-check-passed"/>',
    );
  });

  it("draws Turnstile's box as a client part, with an empty answer and no script tag of its own", () => {
    const widget = createTurnstileBotCheck({
      siteKey: '0x-made-up-site-key',
      secretKey: 'made-up-secret-key',
      siteHostname: 'leagues.example.test',
    }).widget;
    const html = draw(widget);
    // Explicit mode (C1): the box loads the script and draws itself when the form appears,
    // so the page holds no implicit-mode tag or .cf-turnstile box the script would draw once.
    // No answer until the box gives one (and no value of React's to write over it).
    expect(html).toContain('<input type="hidden" name="cf-turnstile-response"/>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('cf-turnstile"');
    expect(html).not.toContain('made-up-secret-key');
  });

  it('says with scripts off what each form checks, in its own words (F5)', () => {
    const widget = createTurnstileBotCheck({
      siteKey: '0x-made-up-site-key',
      secretKey: 'made-up-secret-key',
      siteHostname: 'leagues.example.test',
    }).widget;
    const saidOn = (google: boolean) =>
      (['sign-in', 'sign-up', 'reset'] as const).map(
        (action) =>
          /<noscript><p>([^<]+)<\/p><\/noscript>/.exec(draw(widget, action, google))?.[1] ?? '',
      );
    const withGoogle = saidOn(true);
    const without = saidOn(false);
    expect(withGoogle[0]).toMatch(/^Signing in with a password checks/);
    expect(withGoogle[1]).toMatch(/^Creating an account first checks/);
    expect(withGoogle[2]).toMatch(/^Asking for a code to choose a new password/);
    // In words a parent on a phone understands (step 2.163's fix round), not "scripts".
    for (const said of [...withGoogle, ...without]) {
      expect(said).toContain('Your browser is blocking part of this page');
      expect(said).not.toContain('scripts');
    }
    // A screen that draws Google's button says it works without; one that does not (Google
    // not set up, the test copy) never sends the person to a button that is not there (M27).
    expect(withGoogle[0]).toContain('Or use Continue with Google, which works without it.');
    expect(withGoogle[1]).toContain('Or use Continue with Google, which works without it.');
    for (const said of without) expect(said).not.toContain('Google');
    // The forgotten-password screen has no Google button, so it does not speak of one.
    expect(withGoogle[2]).not.toContain('Google');
  });
});

describe('the words that offer "Continue with Google" (M27)', () => {
  it('are chosen only where the screen draws the button', () => {
    for (const name of ['botCheckDidNotLoad', 'botCheckFailed'] as const) {
      expect(t(problemWords(name, true))).toContain('Continue with Google');
      expect(t(problemWords(name, false))).not.toContain('Google');
      expect(t(problemWords(name, false))).toContain('try again in a few minutes');
    }
    expect(needsScriptsWords('sign-in', false)).toBe('signIn.botCheckNeedsScripts.signInNoGoogle');
    expect(needsScriptsWords('sign-up', false)).toBe('signIn.botCheckNeedsScripts.signUpNoGoogle');
    expect(needsScriptsWords('reset', true)).toBe('signIn.botCheckNeedsScripts.reset');
  });

  it('leave every other problem as it is, and none speaks of Google without the button', () => {
    for (const name of Object.keys(problems) as (keyof typeof problems)[]) {
      if (name !== 'botCheckDidNotLoad' && name !== 'botCheckFailed') {
        expect(problemWords(name, false)).toBe(problems[name]);
      }
      expect(problemWords(name, true)).toBe(problems[name]);
      // "Sign in with Google again" (an account with no password) and the test copy's
      // "does not sign in with Google" are about Google, not a way to tap it.
      if (name !== 'noPassword' && name !== 'googleOff' && name !== 'googleFailed') {
        expect(t(problemWords(name, false))).not.toContain('Continue with Google');
      }
    }
  });
});

describe('fieldRefusal (step 2.102)', () => {
  it('marks both fields after "Wrong email or password", pointing at the refusal above the form', () => {
    const search = { problem: 'wrongEmailOrPassword' };
    for (const field of ['email', 'password'] as const) {
      expect(fieldRefusal(search, field)).toEqual({
        input: { 'aria-invalid': true, 'aria-describedby': 'form-refusal' },
        refusal: null,
      });
    }
  });

  it('keeps a one-field refusal under its own field, and leaves the others unmarked', () => {
    const search = { problem: 'wrongPassword' };
    expect(fieldRefusal(search, 'password').input).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'password-refusal',
    });
    expect(fieldRefusal(search, 'email')).toEqual({ input: {}, refusal: null });
    expect(fieldRefusal({}, 'email')).toEqual({ input: {}, refusal: null });
  });
});
