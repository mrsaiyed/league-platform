'use client';
// The grid's "Saved" (or "Removed"), beside what was saved (step 2.155 part 6). With scripts
// off the browser lands at its place (#saved, the game's row). With scripts on the grid is
// drawn again in place after a button, its address unchanged now that no answer rides in
// it, so nothing moves the phone there: the answer brings itself into view, once, and again
// when its words change, when it is off the screen or under the bar at the top. As
// list-forms' SaidLine does, with the grid's own marks (#saved, data-notice) kept.
import { useEffect, useRef, type ReactNode } from 'react';

export function SaidInView({
  id,
  kind,
  words,
  children,
}: {
  readonly id: string;
  readonly kind: 'saved' | 'removed';
  /** The sentence said: a new one brings it into view again. */
  readonly words: string;
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
  }, [words]);
  return (
    <div ref={ref} id={id} className="ui-notice" data-kind={kind} role="status" data-notice="done">
      {children}
    </div>
  );
}
