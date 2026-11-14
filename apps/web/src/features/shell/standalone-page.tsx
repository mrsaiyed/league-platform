import type { ReactNode } from 'react';

/** Where the stylesheet of these pages is served (src/app/standalone.css/route.ts). */
export const standaloneStylesheet = '/standalone.css';

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
