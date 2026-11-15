// The stylesheet of the pages that belong to no league ("not found", "you do not have
// access"): the neutral starting design as variables, then the shared display pieces.
// Next.js carries those two screens inside every page it sends, so their look must not be
// written into them: it would put a second copy of the styles, and the neutral design's
// colors, into every league's pages. They link to this address instead, and the browser
// keeps it. Made from the same design values and pieces as a league's pages (T-90).
import { designToCssText, startingDesign } from '@srleagues/site';
import { displayCss } from '@srleagues/ui';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(designToCssText(startingDesign('clean-court')) + displayCss, {
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
