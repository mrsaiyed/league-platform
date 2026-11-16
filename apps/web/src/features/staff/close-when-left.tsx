'use client';
// The phone menu's panel covers the page under it. Tabbing past its last entry ("Sign
// out") moved the focus on to the page beneath, out of sight under the panel. With scripts
// on, the menu this is put in shuts when the focus leaves it, so the focus is always
// somewhere that can be seen, and Escape shuts it and gives the focus back to its button.
// With scripts off the menu is the plain disclosure it always was. It draws nothing and
// holds no words.
import { useEffect, useRef } from 'react';

/** Put inside a `<details>`: shuts it when the keyboard's focus leaves it, and on Escape. */
export function CloseWhenLeft() {
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const menu = mark.current?.closest('details');
    if (menu === null || menu === undefined) return;
    const left = (event: FocusEvent) => {
      const to = event.relatedTarget;
      // Only when the focus goes somewhere else on the page: a tap on the page's ground,
      // or leaving the window, moves the focus nowhere and shuts nothing.
      if (to instanceof Node && !menu.contains(to)) menu.open = false;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menu.open) return;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    };
    menu.addEventListener('focusout', left);
    menu.addEventListener('keydown', key);
    return () => {
      menu.removeEventListener('focusout', left);
      menu.removeEventListener('keydown', key);
    };
  }, []);
  return <span ref={mark} hidden />;
}
