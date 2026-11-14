// The stylesheet of the shared display pieces, for every league's pages. It is the same
// text for every league (a league's own look is only the variables its pages carry), so it
// is served once from this address and kept by the browser, instead of being written into
// every page, twice: once as a style block and once in the page's own data. The address
// a page links to carries a mark of the text (features/shell/design-style.tsx), so a new
// version is a new address and this one may be kept for good.
import { displayCss } from '@srleagues/ui';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(displayCss, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
