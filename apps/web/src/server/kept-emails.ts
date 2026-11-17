// THE KEPT EMAILS OF LOCAL WORK AND TESTS (step 2.96, T-140). NEVER IN STAGING OR PRODUCTION.
//
// On the made-up stand-in no email leaves this computer: the email capture of
// packages/providers keeps each one in memory (stand-in-ports.ts). Here a copy of each
// email to a made-up address is also written to the working folder's
// `.local/captured-email/` (git-ignored), so a code or an invitation link can be read on
// the one local page that shows them (`/signin/kept-emails`, local-only.ts) and survives a
// restart. Nothing serves the folder: the web app has no folder of static files, and the
// page reads the files' JSON itself and shows their words as text.
//
// Only an email to a made-up address is written (isMadeUpAddress): one typed by mistake
// with a real address is kept in memory only and never reaches a file. The page shows only
// those too, as it reads: the worker's own capture (EMAIL_CAPTURE_DIR, which .env.example
// suggests pointing at the same folder) writes every address it is given. Nothing here logs
// what an email holds: a failure to write is reported by its kind only (T4 §10, T-86).
import type { EmailMessage, EmailSender, SentEmail } from '@srleagues/core';
import { captureEmail } from '@srleagues/providers';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/** Where the kept emails go, inside the working folder. */
export const keptEmailsPath = ['.local', 'captured-email'] as const;

/** How many of the newest kept emails the page shows. */
export const keptEmailsShown = 50;

/** How far up from where the server runs the working folder is looked for. */
const mostLevels = 6;

/**
 * The kept emails' folder: `.local/captured-email` in the working folder, the first folder
 * at or above `start` (where the server runs: every script starts it in apps/web) whose
 * package.json lists the workspaces. null when there is none: then nothing is written.
 */
export function keptEmailsFolderFrom(start: string): string | null {
  let dir = path.resolve(start);
  for (let level = 0; level < mostLevels; level += 1) {
    if (isWorkingFolder(dir)) return path.join(dir, ...keptEmailsPath);
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

function isWorkingFolder(dir: string): boolean {
  const file = path.join(dir, 'package.json');
  if (!existsSync(file)) return false;
  try {
    const manifest: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return (
      typeof manifest === 'object' &&
      manifest !== null &&
      Array.isArray((manifest as { workspaces?: unknown }).workspaces)
    );
  } catch {
    return false;
  }
}

/**
 * Whether `address` is on a name kept for made-up mail (RFC 2606 and 6761): `.test`,
 * `.example`, `.invalid`, `.localhost`, or example.com, .net and .org. Only these are
 * written to a file.
 */
export function isMadeUpAddress(address: string): boolean {
  const at = address.lastIndexOf('@');
  if (at <= 0) return false;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(domain)) return false;
  if (['test', 'example', 'invalid', 'localhost'].some((top) => domain.endsWith(`.${top}`))) {
    return true;
  }
  return ['example.com', 'example.net', 'example.org'].some(
    (name) => domain === name || domain.endsWith(`.${name}`),
  );
}

export type KeepingSender = {
  readonly sender: EmailSender;
  /** From now on, every email to a made-up address is written to the folder too. */
  readonly startKeeping: () => void;
};

/**
 * `memory` (the email capture the stand-in reads) with a copy of each email to a made-up
 * address written to `folder`, once startKeeping is called: the made-up people's own
 * sign-ups when the app starts are not kept. Of the files it writes, the newest
 * `keptEmailsShown` stay. With no folder, nothing is written.
 */
export function keepingSender(
  memory: EmailSender,
  folder: string | null | undefined,
  options: { readonly now: () => Date; readonly onNotKept: () => void },
): KeepingSender {
  let keeping = false;
  const files =
    folder === null || folder === undefined
      ? null
      : // Only the newest the page shows stay: past them, the app's own oldest files are
        // removed; a file it did not write (the worker's, anyone's) is never touched.
        captureEmail({
          directory: folder,
          now: options.now,
          maxKept: keptEmailsShown,
          filesKept: keptEmailsShown,
        });
  return {
    sender: {
      send: async (message: EmailMessage): Promise<SentEmail> => {
        const sent = await memory.send(message);
        if (keeping && files !== null && isMadeUpAddress(message.to)) {
          await files.send(message).catch(() => options.onNotKept());
        }
        return sent;
      },
    },
    startKeeping: () => {
      keeping = true;
    },
  };
}

/** One kept email, as the page shows it. */
export type KeptEmail = {
  readonly id: string;
  readonly capturedAt: string;
  readonly to: string;
  readonly subject: string;
  /** The plain-text version, shown as text, never as HTML. */
  readonly text: string;
  /** A 6-digit code in it, if it has one. */
  readonly code: string | null;
  /** The links in it to this site's own address (PUBLIC_BASE_URL); no other is followed. */
  readonly links: readonly string[];
};

const keptShape = z.object({
  id: z.string(),
  capturedAt: z.string(),
  to: z.string(),
  subject: z.string(),
  text: z.string(),
});

/**
 * The newest `most` kept emails in `folder` to made-up addresses, newest first; none when it
 * is missing.
 */
export async function readKeptEmails(
  folder: string,
  siteOrigin: string,
  most: number = keptEmailsShown,
): Promise<readonly KeptEmail[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  // Each file is named by the moment it was kept, then its id, so the names sort by time.
  const newest = names
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, most);
  const read = await Promise.all(
    newest.map(async (name) => {
      try {
        const parsed = keptShape.safeParse(
          JSON.parse(await readFile(path.join(folder, name), 'utf8')),
        );
        // An email to any other address is never shown, whoever wrote the file.
        return parsed.success && isMadeUpAddress(parsed.data.to)
          ? keptEmailOf(parsed.data, siteOrigin)
          : null;
      } catch {
        return null;
      }
    }),
  );
  return read.filter((email): email is KeptEmail => email !== null);
}

/** What the page shows of one email: its words, and its code and links found in them. */
export function keptEmailOf(email: z.infer<typeof keptShape>, siteOrigin: string): KeptEmail {
  const origin = originOf(siteOrigin);
  const links = [...email.text.matchAll(/https?:\/\/[^\s<>"']+/g)]
    .map((match) => match[0].replace(/[.,;:)]+$/, ''))
    .filter((link) => origin !== null && originOf(link) === origin);
  return {
    id: email.id,
    capturedAt: email.capturedAt,
    to: email.to,
    subject: email.subject,
    text: email.text,
    code: /(?<![\w-])(\d{6})(?![\w-])/.exec(email.text)?.[1] ?? null,
    links: [...new Set(links)],
  };
}

function originOf(address: string): string | null {
  try {
    return new URL(address).origin;
  } catch {
    return null;
  }
}
