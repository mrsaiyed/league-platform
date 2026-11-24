'use client';
// After a refused try (step 2.102's fix round), the keyboard lands where the trouble is:
// the first field marked wrong, which points at its refusal, or else the refusal above the
// form. It draws nothing; with scripts off the page reads as before, the refusal first.
import { useEffect } from 'react';

export function FocusRefusal() {
  useEffect(() => {
    const main = document.querySelector('main.sign-in');
    const target =
      main?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      main?.querySelector<HTMLElement>('.ui-refusal[tabindex]');
    target?.focus();
  }, []);
  return null;
}
