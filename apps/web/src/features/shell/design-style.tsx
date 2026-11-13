import { designToCssText, type DesignDocument } from '@srleagues/site';

/**
 * The league's design as CSS variables, once per page (T-90): one style block, no
 * stylesheet per league. Every value in it is a color, a known font stack or a fixed
 * keyword (packages/site), so nothing a league typed reaches the text.
 */
export function DesignStyle({ design }: { readonly design: DesignDocument }) {
  return <style dangerouslySetInnerHTML={{ __html: designToCssText(design) }} />;
}
