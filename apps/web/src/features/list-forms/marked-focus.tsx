'use client';
// After a refusal of a plain server form (the schedule grid, step 2.155), the first marked
// box inside `within` has the focus and is in the middle of the screen. `autoFocus` alone
// does not do it with scripts on: Next.js draws the answer into the page already there, and
// a box already there is not focused again. Drawn only beside a refusal; its effect runs
// on each answer drawn.
import { useEffect } from 'react';

export function MarkedFocus({ within }: { readonly within: string }) {
  useEffect(() => {
    const box = document
      .getElementById(within)
      ?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (box === null || box === undefined) return;
    box.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'center' });
  });
  return null;
}
