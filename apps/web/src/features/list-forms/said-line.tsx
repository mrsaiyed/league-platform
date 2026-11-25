'use client';
// "Saved" or "Removed", beside the thing (step 2.49; step 2.155, A-4): with scripts on the
// screen is drawn again in place after a save, and what changed above it (a question gone,
// the line itself added, a game just made final leaving "Needs a result", step 2.156) can
// move it off the screen or under the header that stays at the top; it brings itself into
// view, once, and again when its words change. With scripts off the browser lands at the
// thing's place (#…). The games area's own copy (saved-line.tsx) was folded into this one.
import { useEffect, useRef, type ReactNode } from 'react';
import { saidRole, type SaidKind } from './said-kind.ts';

export function SaidLine({
  kind,
  children,
}: {
  readonly kind: SaidKind;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Words given as plain text bring the line into view again when they change; anything
  // else only when it is first drawn.
  const words = typeof children === 'string' ? children : undefined;
  useEffect(() => {
    const line = ref.current;
    if (line === null) return;
    const box = line.getBoundingClientRect();
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const covered = atCentre !== null && !line.contains(atCentre);
    if (box.top < 0 || box.bottom > window.innerHeight || covered) {
      line.scrollIntoView({ block: 'center' });
    }
  }, [words]);
  return (
    <div ref={ref} className="ui-notice" data-kind={kind} role={saidRole(kind)} data-said={kind}>
      {children}
    </div>
  );
}
