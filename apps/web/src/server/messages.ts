// The interface text of the server's pages (T-187). English until a league's own
// language is chosen (step 1.18).
import { createTranslator, type Translate } from '@srleagues/site';

export const locale = 'en';
export const t: Translate = createTranslator(locale);

/** A key of a message that is not a plural. */
export type TextKey = Parameters<Translate>[0];
