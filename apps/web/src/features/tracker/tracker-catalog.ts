// The words the tracker's device needs (T-187), handed to it by the page: the tracker's
// own messages from the language's message file, and nothing else, so the device gets a
// translator for them (createTranslator) without carrying the whole site's words.
import type { Catalog } from '@srleagues/site';

const prefix = 'tracker.';

export function trackerCatalog(catalog: Catalog): Catalog {
  return Object.fromEntries(Object.entries(catalog).filter(([key]) => key.startsWith(prefix)));
}
