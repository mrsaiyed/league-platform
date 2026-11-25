'use client';
// An answer that brings itself into view (step 2.155 part 6, T-437). With scripts off the
// browser lands at the answer's place (#…) or at the top of the page. With scripts on a
// screen whose address no longer changes after a button is drawn again in place, so nothing
// moves the phone to the answer: a refusal (or "Saved") beside a form far down the page, or
// at its top after a button far down it, would be said where nobody sees it. It brings
// itself into view, once, and again when its words change, when it is off the screen or
// under the bar at the top. SaidLine and the schedule's SaidInView do the same.
import { createElement, useEffect, useRef, type ReactNode, type RefObject } from 'react';

/** Brings the element into view when it is drawn, and again when `words` change. */
export function useIntoView(ref: RefObject<HTMLElement | null>, words: string): void {
  useEffect(() => {
    const line = ref.current;
    if (line === null) return;
    const box = line.getBoundingClientRect();
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const covered = atCentre !== null && !line.contains(atCentre);
    if (box.top < 0 || box.bottom > window.innerHeight || covered) {
      line.scrollIntoView({ block: 'center' });
    }
  }, [ref, words]);
}

/** The notice as the page drew it (its tag, class, role, id and data-… marks), brought into view. */
export function IntoView({
  tag = 'p',
  words,
  marks,
  children,
}: {
  readonly tag?: 'p' | 'div';
  /** The sentence said: a new one brings it into view again. */
  readonly words: string;
  /** The element's own attributes: className, role, id, data-kind and its data-… marks. */
  readonly marks: Readonly<Record<string, string | undefined>>;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useIntoView(ref, words);
  return createElement(tag, { ...marks, ref, 'data-into-view': '' }, children);
}
