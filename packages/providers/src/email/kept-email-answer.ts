// What scripts/read-kept-emails.mjs prints of a kept email (step 2.204): chosen by what
// kind of email it is, kept with it (migration 0023's `kind`), never guessed from its
// words. A code email gives its 6-digit code; any other its first link, so a number in a
// league's name ("Class of 202526") is never printed for an invitation. Else nothing.

export type KeptEmailAnswer =
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'link'; readonly value: string };

/** A kept email: what it carries (`code` or `link`) and its plain words. */
export type KeptEmailWords = { readonly kind: 'code' | 'link'; readonly text: string };

export function keptEmailAnswer(email: KeptEmailWords): KeptEmailAnswer | null {
  if (email.kind === 'code') {
    const code = /(?<![\w-])(\d{6})(?![\w-])/.exec(email.text)?.[1];
    return code === undefined ? null : { kind: 'code', value: code };
  }
  const link = /https?:\/\/[^\s<>"']+/.exec(email.text)?.[0]?.replace(/[.,;:)]+$/, '');
  return link === undefined ? null : { kind: 'link', value: link };
}
