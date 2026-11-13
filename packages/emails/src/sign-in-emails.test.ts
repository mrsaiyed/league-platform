// The sign-in emails: words from the message files, values escaped, and "you already
// have an account" only on a sign-up code to an address that has one (T-68).
import { describe, expect, it } from 'vitest';
import {
  newDeviceEmail,
  passwordChangedEmail,
  signInCodeEmail,
  type SignInEmailKey,
} from './sign-in-emails.ts';

const t = (key: SignInEmailKey, params?: Readonly<Record<string, string | number>>) =>
  params === undefined ? `[${key}]` : `[${key} ${JSON.stringify(params)}]`;

const siteUrl = 'https://leagues.example.test';

describe('signInCodeEmail', () => {
  it('carries the code and how long it works', () => {
    const email = signInCodeEmail(
      { purpose: 'sign-up', code: '123456', validMinutes: 10, accountExists: false, siteUrl },
      t,
    );
    expect(email.subject).toBe('[email.signInCode.subjectSignUp]');
    expect(email.text).toContain('"code":"123456"');
    expect(email.text).not.toContain('email.signInCode.existing');
    expect(email.html).toContain('[site.poweredBy]');
  });

  it('tells the mailbox, and only the mailbox, that the account already exists', () => {
    const email = signInCodeEmail(
      { purpose: 'sign-up', code: '123456', validMinutes: 10, accountExists: true, siteUrl },
      t,
    );
    expect(email.text).toContain('[email.signInCode.existing]');
    const reset = signInCodeEmail(
      { purpose: 'reset', code: '123456', validMinutes: 10, accountExists: true, siteUrl },
      t,
    );
    expect(reset.subject).toBe('[email.signInCode.subjectReset]');
    expect(reset.text).not.toContain('email.signInCode.existing');
  });
});

describe('notices', () => {
  it('names the device, escaped, and links to the account page', () => {
    const email = newDeviceEmail(
      {
        deviceLabel: 'Evil <b>browser</b>',
        when: '13 Nov 2026, 12:00 UTC',
        accountUrl: `${siteUrl}/account`,
        siteUrl,
      },
      t,
    );
    expect(email.subject).toBe('[email.newDevice.subject]');
    expect(email.html).not.toContain('<b>browser</b>');
    expect(email.html).toContain(`${siteUrl}/account`);
  });

  it('says the password changed and where to reset it', () => {
    const email = passwordChangedEmail(
      { when: 'now', resetUrl: `${siteUrl}/signin/forgot`, siteUrl },
      t,
    );
    expect(email.subject).toBe('[email.passwordChanged.subject]');
    expect(email.text).toContain(`${siteUrl}/signin/forgot`);
  });
});
