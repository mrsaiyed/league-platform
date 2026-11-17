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

const draw = (widget: Parameters<typeof BotCheckField>[0]['widget'], nonce?: string) =>
  renderToStaticMarkup(createElement(BotCheckField, { widget, action: 'sign-up', nonce }));

describe('BotCheckField', () => {
  it('draws nothing when the check is off (staging without its keys, T-270)', () => {
    expect(draw(createBotCheckOff().widget)).toBe('');
  });

  it("draws the stand-in's hidden answer", () => {
    expect(draw(createLocalBotCheck({ appEnv: 'test' }).widget)).toBe(
      '<input type="hidden" name="cf-turnstile-response" value="local-bot-check-passed"/>',
    );
  });

  it("draws Turnstile's box for this form, and its script with the answer's nonce", () => {
    const widget = createTurnstileBotCheck({
      siteKey: '0x-made-up-site-key',
      secretKey: 'made-up-secret-key',
      siteHostname: 'leagues.example.test',
    }).widget;
    const html = draw(widget, 'bWFkZS11cC1ub25jZQ==');
    expect(html).toContain(
      'src="https://challenges.cloudflare.com/turnstile/v0/api.js" async="" defer="" nonce="bWFkZS11cC1ub25jZQ=="',
    );
    expect(html).toContain('data-sitekey="0x-made-up-site-key" data-action="sign-up"');
    expect(html).not.toContain('made-up-secret-key');
  });
});
