// The words of the page an area of the admin shows while it has no screen of its own
// (apps/web/src/features/staff/staff-pages.tsx, AdminArea), for the checks that prove a
// real screen has taken that page's place: they look for these words and must not find
// them. The words are read from the message file by their key, so a check can never go on
// looking for words the page no longer says (step 2.103: the placeholder's sentence was
// changed, and every such check passed whatever the page showed).
import { en } from '../packages/site/src/messages/en.ts';

/** The sentence of the placeholder's panel, as the page writes it today. */
export const adminPlaceholder = en['admin.notReady.body'];

if (typeof adminPlaceholder !== 'string' || adminPlaceholder.trim() === '') {
  throw new Error('The admin placeholder’s sentence (admin.notReady.body) is missing.');
}
