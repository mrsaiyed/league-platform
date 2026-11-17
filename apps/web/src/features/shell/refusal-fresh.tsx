'use client';
// A refusal drawn for this moment, not for the last page load (step 2.157). Next.js draws
// "You do not have access" (app/forbidden.tsx) once with each whole page it sends, and keeps
// that copy while the browser moves on inside the app without loading a whole page: after
// a form is sent, for instance. So when the session changed in between (another account
// signed in on this device, in another tab) or the refused address is not the one the copy
// was drawn for, the copy named the account signed in before and the admin it had, and led
// back to the wrong place. When the refusal comes into view that way, this asks the server
// for the page again, once, and Next.js draws the refusal afresh for whoever is signed in
// now. A refusal that came with its own whole page is already fresh and asks nothing. With
// scripts off every page is a whole page, so this is not needed. It draws nothing and holds
// no words.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Whether this document's first page has come into view: anything after it was moved to. */
let documentShown = false;
/** The address last asked for again, and when, so one refusal asks once. */
let asked: { readonly at: string; readonly when: number } | null = null;
const askOnceWithinMs = 10_000;

/**
 * Put once in the root layout, after the page: marks the document's first page as shown.
 * Its effect runs after those of the page before it, the refusal's among them.
 */
export function DocumentShown() {
  useEffect(() => {
    documentShown = true;
  }, []);
  return null;
}

/** Put in the refusal: draws it again from the server when it came from an earlier load. */
export function RefusalFresh() {
  const router = useRouter();
  useEffect(() => {
    if (!documentShown) return;
    const at = window.location.pathname + window.location.search;
    const now = Date.now();
    if (asked !== null && asked.at === at && now - asked.when < askOnceWithinMs) return;
    asked = { at, when: now };
    router.refresh();
  }, [router]);
  return null;
}
