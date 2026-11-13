// T-140: outside production, no email leaves the machine, whatever keys are set.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailSenderFor } from './email-sender-for.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const message = {
  from: 'hello@example.test',
  to: 'player@example.test',
  subject: 'Hi',
  html: '<p>Hi</p>',
  text: 'Hi',
  idempotencyKey: 'k',
};

describe('emailSenderFor', () => {
  it('captures in local, test and staging, even with a key, and never calls the network', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    for (const appEnv of ['local', 'test', 'staging'] as const) {
      const chosen = emailSenderFor({ appEnv, resendApiKey: 're_made_up_key' });
      expect(chosen.kind).toBe('capture');
      await chosen.sender.send(message);
      if (chosen.kind === 'capture') expect(chosen.sender.messages()).toHaveLength(1);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it('uses Resend only in production, and needs its key there', () => {
    expect(emailSenderFor({ appEnv: 'production', resendApiKey: 're_made_up_key' }).kind).toBe(
      'resend',
    );
    expect(() => emailSenderFor({ appEnv: 'production' })).toThrow('needs RESEND_API_KEY');
    expect(() => emailSenderFor({ appEnv: 'production', resendApiKey: ' ' })).toThrow();
  });
});
