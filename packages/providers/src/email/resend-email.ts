// Resend (T-11), production only (T-140, emailSenderFor). Not verified against the
// live service: written from Resend's published API (POST /emails, an
// Idempotency-Key header so one email is sent once however often its job runs,
// T-137) and tested only against recorded-style answers, never over the network.
//
// Errors carry a fixed code and the HTTP status, never the response text, the
// address, the content or the key (T-86).
import { EmailSendError, type EmailMessage, type EmailSender } from '@srleagues/core';

export type ResendEmailOptions = {
  readonly apiKey: string;
  /** Stand-in for tests; the real fetch otherwise. */
  readonly fetch?: typeof fetch;
  readonly baseUrl?: string;
  /** How long to wait for an answer. Default 15 seconds. */
  readonly timeoutMs?: number;
};

/** What a status means for this email, and whether trying again later can help. */
function refusal(status: number): EmailSendError {
  if (status === 429) return new EmailSendError('rate-limited', true, status);
  // Our key or account: retried, so that once someone fixes it the emails still go.
  if (status === 401 || status === 403) return new EmailSendError('not-authorized', true, status);
  // This idempotency key was used for a different email, or is in use: sending the
  // same email again with it cannot succeed, and a new key could send it twice.
  if (status === 409) return new EmailSendError('rejected', false, status);
  if (status >= 500) return new EmailSendError('unavailable', true, status);
  return new EmailSendError('rejected', false, status);
}

export function resendEmail(options: ResendEmailOptions): EmailSender {
  const send = options.fetch ?? fetch;
  const url = `${options.baseUrl ?? 'https://api.resend.com'}/emails`;
  return {
    send: async (message: EmailMessage) => {
      let response: Response;
      try {
        response = await send(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': message.idempotencyKey,
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            ...(message.replyTo === undefined ? {} : { reply_to: message.replyTo }),
            ...(message.headers === undefined ? {} : { headers: message.headers }),
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
        });
      } catch {
        // Unreachable, or no answer in time. Its own error may name the address.
        throw new EmailSendError('unavailable', true);
      }
      if (!response.ok) throw refusal(response.status);
      const answer: unknown = await response.json().catch(() => undefined);
      const id = (answer as { id?: unknown } | undefined)?.id;
      // Accepted, but not as expected: trying again is safe (the same key).
      if (typeof id !== 'string' || id === '') {
        throw new EmailSendError('unexpected-answer', true, response.status);
      }
      return { id };
    },
  };
}
