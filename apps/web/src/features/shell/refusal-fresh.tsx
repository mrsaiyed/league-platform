'use client';
// A refusal drawn for this moment, not for the last page load (step 2.157). Next.js draws
// "You do not have access" (app/forbidden.tsx) once with each whole page it sends, and keeps
// that copy while the browser moves on inside the app without loading a whole page: after
// a form is sent, for instance. So when the session changed in between (another account
// signed in on this device, in another tab) or the refused address is not the one the copy
// was drawn for, the copy named the account signed in before and the admin it had, and led
// back to the wrong place. When the refusal comes into view that way, this draws nothing,
// asks the server for the page again, once, and draws the refusal only when the fresh one
// has come, for whoever is signed in now: on a slow connection the person sees the page go
// blank for a moment, never another account's name. A refusal that came with its own whole
// page is already fresh, and is drawn at once. With scripts off this does nothing, and
// neither the refusal nor "Page not found" is drawn at all: Next.js 16.4 sends a refused
// page as an empty shell that only its script fills in (record 020). Drawing them without
// scripts is step 2.217. It holds no words.
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ReactNode } from 'react';

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

/** Whether a refusal coming into view now is a copy kept from an earlier load. */
function keptFromEarlier(): boolean {
  if (!documentShown) return false;
  const at = window.location.pathname + window.location.search;
  // The copy drawn again just after this one asked is the fresh one.
  return !(asked !== null && asked.at === at && Date.now() - asked.when < askOnceWithinMs);
}

/** Wraps the refusal: draws it only once it is the one drawn for whoever is signed in now. */
export function RefusalFresh({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'fresh' | 'asking' | 'asked'>(() =>
    typeof window !== 'undefined' && keptFromEarlier() ? 'asking' : 'fresh',
  );
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (state !== 'asking') return;
    asked = { at: window.location.pathname + window.location.search, when: Date.now() };
    startTransition(() => router.refresh());
    setState('asked');
  }, [state, router]);
  if (state === 'asking' || (state === 'asked' && pending)) return null;
  return <>{children}</>;
}
