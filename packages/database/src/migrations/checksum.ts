// A migration's fingerprint, recorded when it is applied (T-48). The text is
// normalised first (no byte-order mark, LF line endings), so the same file has the
// same checksum on Windows and Linux checkouts. scripts/structure/migration-safety.mjs
// computes the same value for its allowlist; a test keeps the two equal.
import { createHash } from 'node:crypto';

/** The text as it is applied: byte-order mark removed, CRLF turned into LF. */
export function normalizeMigrationText(text: string): string {
  const withoutMark = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutMark.replace(/\r\n/g, '\n');
}

/** SHA-256 of the normalised text, as 64 hex characters. */
export function migrationChecksum(text: string): string {
  return createHash('sha256').update(normalizeMigrationText(text), 'utf8').digest('hex');
}
