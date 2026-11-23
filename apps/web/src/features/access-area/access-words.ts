// What a refused change on the Admins page says, and which box it is about (step 2.97,
// record 067): a command's error code becomes one sentence from the message files,
// said beside the box or the button it is about. Plain functions, tested without a server.
import type { TextKey } from '../../server/messages.ts';

/** The codes the page has a sentence of its own for; any other is "could not be done". */
const ownSentences = new Set([
  'already-invited',
  'confirm',
  'grant-already-revoked',
  'grant-not-found',
  'invitation-closed',
  'invitation-not-found',
  'invitation-withdrawn',
  'league-read-only',
  'not-allowed',
]);

/** The sentence for a refusal; for bad input, the sentence of the box that is wrong. */
export function problemKeyOf(code: string, wrong: readonly string[] = []): TextKey {
  if (code === 'invalid-input') {
    if (wrong.includes('email')) return 'adminAccess.problem.email';
    if (wrong.includes('role')) return 'adminAccess.problem.role';
    return 'adminAccess.problem.unknown';
  }
  // A role that cannot be given at the whole league yet is a role not in this page's list.
  if (code === 'role-does-not-fit-scope' || code === 'scope-not-available') {
    return 'adminAccess.problem.role';
  }
  return ownSentences.has(code)
    ? (`adminAccess.problem.${code}` as TextKey)
    : 'adminAccess.problem.unknown';
}

/**
 * The invite form's boxes a refusal is about: from the command's own list of what was not
 * valid (define-command.ts: each issue's path), or the code itself.
 */
export function wrongInviteFields(
  code: string,
  issues: readonly { readonly path: string }[] = [],
): string[] {
  if (code === 'invalid-input') {
    const named = ['email', 'role'].filter((field) =>
      issues.some((issue) => issue.path === field || issue.path.startsWith(`${field}.`)),
    );
    return named.length > 0 ? named : ['email'];
  }
  if (code === 'already-invited') return ['email'];
  if (code === 'role-does-not-fit-scope' || code === 'scope-not-available') return ['role'];
  return [];
}
