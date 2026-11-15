'use client';
// "Saved", beside the thing saved (step 2.155; A-4). With scripts on, the screen is drawn
// again in place after a save, and what changed above it (a question gone, the line
// itself added) can move it off the screen, or under the header that stays at the top (a
// game just made final leaves "Needs a result", and its line is at the top of the page,
// step 2.156): it brings itself into view, once. With scripts off the browser lands at the
// thing's place (the address's #…), where it already is.
import { useEffect, useRef } from 'react';

export function SavedLine({ text }: { readonly text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const line = ref.current;
    if (line === null) return;
    const box = line.getBoundingClientRect();
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const covered = atCentre !== null && !line.contains(atCentre);
    if (box.top < 0 || box.bottom > window.innerHeight || covered) {
      line.scrollIntoView({ block: 'center' });
    }
  }, [text]);
  return (
    <p ref={ref} className="ui-notice" role="status">
      {text}
    </p>
  );
}
