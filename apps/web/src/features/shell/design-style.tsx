import { createHash } from 'node:crypto';
import { displayCss } from '@srleagues/ui';
import { designToCssText, type DesignDocument } from '@srleagues/site';

/**
 * The mark of the shared display pieces' stylesheet: made from its own text, so a changed
 * stylesheet has a new mark. The page links to the stylesheet with this mark, and the
 * address that serves it (src/app/display.css/route.ts) says "keep this for good" only to
 * a request that asks for the very text it is sending.
 */
export const displayStylesheetMark = createHash('sha256')
  .update(displayCss)
  .digest('hex')
  .slice(0, 12);

/** Where the shared display pieces' stylesheet is served, with the mark of its text. */
export const displayStylesheet = `/display.css?v=${displayStylesheetMark}`;

/**
 * The league's design as CSS variables, once per page (T-90): one small style block, no
 * stylesheet per league. Every value in it is a color, a known font stack or a fixed keyword
 * (packages/site), so nothing a league typed reaches the text. The shared display pieces'
 * stylesheet (step 2.41), the same for every league, is linked beside it, so the browser
 * fetches it once and keeps it. Its place among the page's stylesheets is after the frame's
 * own (`precedence`), as when it was written into the page.
 */
export function DesignStyle({ design }: { readonly design: DesignDocument }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: designToCssText(design) }} />
      <link rel="stylesheet" href={displayStylesheet} precedence="pieces" />
    </>
  );
}
