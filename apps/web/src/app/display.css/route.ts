// The stylesheet of the shared display pieces, for every league's pages. It is the same
// text for every league (a league's own look is only the variables its pages carry), so it
// is served once from this address and kept by the browser, instead of being written into
// every page, twice: once as a style block and once in the page's own data.
//
// A page links to it with a mark made from the text (`?v=`, features/shell/design-style.tsx).
// Only a request whose mark is the mark of the text being sent is told to keep it for
// good. Any other request (no mark, or the mark of another version, as when two builds
// answer at once during a release) still gets the current text, so no page is ever left
// unstyled, but only for a minute: an old build's text is then never kept for a year under
// a new build's address.
import { displayCss } from '@srleagues/ui';
import { displayStylesheetMark } from '../../features/shell/index.ts';

const keepForGood = 'public, max-age=31536000, immutable';
const keepBriefly = 'public, max-age=60';

export function GET(request: Request): Response {
  const asked = new URL(request.url).searchParams.get('v');
  return new Response(displayCss, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': asked === displayStylesheetMark ? keepForGood : keepBriefly,
    },
  });
}
