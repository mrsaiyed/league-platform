// The bot check's widget in a sign-in form (record 081): what each kind draws.
import {
  createBotCheckOff,
  createLocalBotCheck,
  createTurnstileBotCheck,
} from '@srleagues/providers';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BotCheckField } from './sign-in-parts.tsx';

const draw = (
  widget: Parameters<typeof BotCheckField>[0]['widget'],
  action: Parameters<typeof BotCheckField>[0]['action'] = 'sign-up',
) => renderToStaticMarkup(createElement(BotCheckField, { widget, action }));

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
    const said = (['sign-in', 'sign-up', 'reset'] as const).map(
      (action) => /<noscript><p>([^<]+)<\/p><\/noscript>/.exec(draw(widget, action))?.[1],
    );
    expect(said[0]).toMatch(/^Signing in with a password checks/);
    expect(said[1]).toMatch(/^Creating an account first checks/);
    expect(said[2]).toMatch(/^Asking for a code to choose a new password/);
    expect(said[0]).toContain('Continue with Google works without scripts and has no check.');
    expect(said[1]).toContain('Continue with Google works without scripts and has no check.');
    // The forgotten-password screen has no Google button, so it does not speak of one.
    expect(said[2]).not.toContain('Google');
  });
});
