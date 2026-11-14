import { createHash } from 'node:crypto';
import { displayCss } from '@srleagues/ui';
import { designToCssText, type DesignDocument } from '@srleagues/site';

/**
 * Where the shared display pieces' stylesheet is served (src/app/display.css/route.ts). The
 * mark after the question mark is made from the stylesheet's own text, so a changed
 * stylesheet has a new address and the browser may keep each one for good.
 */
export const displayStylesheet = `/display.css?v=${createHash('sha256')
  .update(displayCss)
  .digest('hex')
  .slice(0, 12)}`;

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
