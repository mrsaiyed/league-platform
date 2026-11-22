// What scripts/read-kept-emails.mjs prints of a kept email (step 2.204): its 6-digit code
// when it has one (a sign-in or sign-up code), else its first link (an invitation),
// else nothing. Found in the plain words the same way as the local page finds them
// (apps/web kept-emails.ts).

export type KeptEmailAnswer =
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'link'; readonly value: string };

export function keptEmailAnswer(text: string): KeptEmailAnswer | null {
  const code = /(?<![\w-])(\d{6})(?![\w-])/.exec(text)?.[1];
  if (code !== undefined) return { kind: 'code', value: code };
  const link = /https?:\/\/[^\s<>"']+/.exec(text)?.[0]?.replace(/[.,;:)]+$/, '');
  return link === undefined ? null : { kind: 'link', value: link };
}
