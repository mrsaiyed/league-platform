// T-140: outside production, no email leaves the machine. This sender keeps each
// email instead of sending it: in memory, for tests to read, and, given a folder,
// as files to open and inspect (a .json with everything, an .html to look at).
// Like the real service, it keeps one email per idempotency key (T-137).
//
// For made-up data only (T-201): local work, tests and staging, never real people's
// email. Memory holds the newest `maxKept` emails, so a long-running worker cannot
// grow without end; an idempotency key is remembered as long as its email is kept.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EmailMessage, EmailSender, SentEmail } from '@srleagues/core';

export type CapturedEmail = EmailMessage & {
  readonly id: string;
  /** When it was captured, as an ISO time. */
  readonly capturedAt: string;
};

export type CaptureEmail = EmailSender & {
  /** The emails captured and still kept, oldest first. */
  readonly messages: () => readonly CapturedEmail[];
  /** Forgets every email captured so far (the files stay). */
  readonly clear: () => void;
};

export type CaptureEmailOptions = {
  /** A folder to write each email to as well; made if missing. */
  readonly directory?: string;
  readonly now?: () => Date;
  /** How many emails memory keeps, newest first. Default 1000. */
  readonly maxKept?: number;
};

export function captureEmail(options: CaptureEmailOptions = {}): CaptureEmail {
  const now = options.now ?? (() => new Date());
  const maxKept = Math.max(1, options.maxKept ?? 1000);
  let captured: CapturedEmail[] = [];

  async function send(message: EmailMessage): Promise<SentEmail> {
    const earlier = captured.find((m) => m.idempotencyKey === message.idempotencyKey);
    if (earlier !== undefined) return { id: earlier.id };
    const email: CapturedEmail = {
      ...message,
      id: `captured-${randomUUID()}`,
      capturedAt: now().toISOString(),
    };
    captured.push(email);
    if (captured.length > maxKept) captured = captured.slice(-maxKept);
    if (options.directory !== undefined) {
      await mkdir(options.directory, { recursive: true });
      // Named by time and id only, so the folder lists in order and names nobody.
      const name = `${email.capturedAt.replace(/[:.]/g, '-')}-${email.id}`;
      await writeFile(
        path.join(options.directory, `${name}.json`),
        `${JSON.stringify(email, null, 2)}\n`,
      );
      await writeFile(path.join(options.directory, `${name}.html`), email.html);
    }
    return { id: email.id };
  }

  return {
    send,
    messages: () => [...captured],
    clear: () => {
      captured = [];
    },
  };
}
