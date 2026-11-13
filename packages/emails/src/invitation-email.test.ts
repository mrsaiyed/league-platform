// The invitation email's template: words from the message files, values escaped.
import { describe, expect, it } from 'vitest';
import { invitationEmail, type InvitationEmailKey } from './invitation-email.ts';
import { escapeHtml, fromHeader, headerText } from './rendered-email.ts';

// Stands in for the site's translator: the key, then its values.
const t = (key: InvitationEmailKey, params?: Readonly<Record<string, string | number>>) =>
  params === undefined ? `[${key}]` : `[${key} ${JSON.stringify(params)}]`;

const data = {
  leagueName: 'North <League> & "Friends"',
  roleName: 'Editor',
  acceptUrl: 'https://leagues.example.test/north-league/invitation/abc?x=1&y=2',
  lifetimeDays: 14,
  siteUrl: 'https://leagues.example.test',
};

describe('invitationEmail', () => {
  it('takes every word from the message files', () => {
    const email = invitationEmail(data, t);
    expect(email.subject).toBe(
      `[email.invitation.subject ${JSON.stringify({ league: data.leagueName })}]`,
    );
    for (const key of [
      'email.invitation.action',
      'email.invitation.howTo',
      'email.invitation.notExpected',
      'site.poweredBy',
    ]) {
      expect(email.text).toContain(`[${key}]`);
    }
    expect(email.text).toContain('"days":14');
    expect(email.text).toContain('"role":"Editor"');
  });

  it('carries the link in both versions, escaped in the HTML', () => {
    const email = invitationEmail(data, t);
    expect(email.text).toContain(data.acceptUrl);
    expect(email.html).toContain(
      'href="https://leagues.example.test/north-league/invitation/abc?x=1&amp;y=2"',
    );
    expect(email.html).not.toContain('<League>');
    expect(email.html).toContain('North &lt;League&gt; &amp; \\&quot;Friends\\&quot;');
  });

  it('keeps the subject on one header line', () => {
    // Words that put the name in as it is, as the real catalog's do.
    const plain = (key: InvitationEmailKey, params?: Readonly<Record<string, string | number>>) =>
      `${key} ${String(params?.['league'] ?? '')}`;
    const email = invitationEmail({ ...data, leagueName: 'North\r\nBcc: x@example.test' }, plain);
    expect(email.subject).toBe('email.invitation.subject North Bcc: x@example.test');
  });
});

describe('headerText', () => {
  it('turns every run of characters that could end a header line into one space', () => {
    for (const breaker of ['\r', '\n', '\t', '\v', '\f', '\0', '\u0085', '\u2028', '\u2029']) {
      expect(headerText(`North${breaker}${breaker}League`)).toBe('North League');
    }
    expect(headerText('  North League  ')).toBe('North League');
  });
});

describe('escapeHtml', () => {
  it('escapes what could end text or an attribute', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('fromHeader', () => {
  it("puts the league's name before the sending address, quoted", () => {
    expect(fromHeader('North League', 'leagues@mail.example.test')).toBe(
      '"North League" <leagues@mail.example.test>',
    );
    expect(fromHeader('Say "hi" \\ there', 'a@example.test')).toBe(
      '"Say \\"hi\\" \\\\ there" <a@example.test>',
    );
  });

  it('cannot be made to start another header', () => {
    expect(fromHeader('North\r\nBcc: x@example.test', 'a@example.test')).toBe(
      '"North Bcc: x example.test" <a@example.test>',
    );
    for (const breaker of ['\v', '\f', '\0', '\u0085', '\u2028', '\u2029']) {
      expect(fromHeader(`North${breaker}Bcc: b`, 'a@example.test')).toBe(
        '"North Bcc: b" <a@example.test>',
      );
    }
    expect(fromHeader('  ', 'a@example.test')).toBe('a@example.test');
  });

  it('cannot be made to name a second address', () => {
    expect(fromHeader('North <x@example.test>', 'a@example.test')).toBe(
      '"North x example.test" <a@example.test>',
    );
    expect(fromHeader('<>@', 'a@example.test')).toBe('a@example.test');
  });

  it('refuses a sending address that is not one plain address', () => {
    for (const address of [
      '',
      'not an address',
      '@example.test',
      'a@',
      'a@b@example.test',
      'North <a@example.test>',
      'a@example.test, b@example.test',
      'a@example.test\r\nBcc: b@example.test',
      'a@example.test\u2028',
      'a\u0085@example.test',
      'a\0@example.test',
    ]) {
      expect(() => fromHeader('North', address)).toThrow(TypeError);
    }
  });
});
