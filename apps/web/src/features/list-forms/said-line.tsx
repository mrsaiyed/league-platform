'use client';
// "Saved" or "Removed", beside the thing (step 2.49, as the games area's saved-line.tsx):
// with scripts on the screen is drawn again in place after a save, and what changed above
// it can move it off the screen or under the header that stays at the top; it brings
// itself into view, once. With scripts off the browser lands at the thing's place (#…).
import { useEffect, useRef, type ReactNode } from 'react';

export function SaidLine({
  kind,
  children,
}: {
  readonly kind: 'saved' | 'removed';
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const line = ref.current;
    if (line === null) return;
    const box = line.getBoundingClientRect();
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const covered = atCentre !== null && !line.contains(atCentre);
    if (box.top < 0 || box.bottom > window.innerHeight || covered) {
      line.scrollIntoView({ block: 'center' });
    }
  }, []);
  return (
    <div ref={ref} className="ui-notice" data-kind={kind} role="status" data-said={kind}>
      {children}
    </div>
  );
}
