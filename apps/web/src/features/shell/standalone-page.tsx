import { neutralStartingDesign, startingDesign } from '@srleagues/site';
import type { ReactNode } from 'react';

/** Where the stylesheet of these pages is served (src/app/standalone.css/route.ts). */
export const standaloneStylesheet = '/standalone.css';

/**
 * SR Leagues' own look (step 2.102, T-325): the neutral starting design's colors, with a
 * serif for its titles (DESIGN.md section 3: "a serif for every title"). The pages that belong to no
 * league take their look from it (src/app/standalone.css/route.ts); a league never sees it.
 */
export const platformDesign = {
  ...startingDesign(neutralStartingDesign),
  fonts: { ...startingDesign(neutralStartingDesign).fonts, heading: 'gelasio' },
} as const;

/**
 * The frame of a page that belongs to no league: "not found" and "you do not have access".
 * It carries the neutral starting design, never a league's own, so a refusal cannot show
 * whether a league exists or what it looks like (U-9). Its styles are linked, not written
 * in: Next.js sends these screens inside every page, and they must stay small.
 */
export function StandalonePage({ children }: { readonly children: ReactNode }) {
  return (
    <div className="ui-root ui-standalone">
      <link rel="stylesheet" href={standaloneStylesheet} precedence="default" />
      {children}
    </div>
  );
}
