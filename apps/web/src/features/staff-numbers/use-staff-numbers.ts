'use client';
// What a public page shows of the numbers it leaves out, for whoever is signed in on this
// device now (step 2.46; T-95). Nothing until the signed-in request answers; then, for a
// person allowed more, the note and the page's numbers as the server read them for them.
//
// It is asked again, as whoever is signed in by then, each time the page is shown again:
// when its tab comes back into view (a session ended in another tab, or a sign-out there, is
// seen then) and when the browser brings the page back from its memory after Back or
// Forward. Before the browser keeps a page it is leaving (a sign-out, a link, closing the
// tab), the numbers are taken off it, so no page kept in that memory holds them; brought
// back, it shows the public numbers until the new answer says otherwise. A read that fails
// leaves the public numbers.
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  browserReadStaffNumbers,
  type ParsedMore,
  type ReadStaffNumbers,
  type StaffNumbersPage,
} from './staff-numbers-reply.ts';

export function useStaffNumbers(
  address: string,
  page: StaffNumbersPage,
  read: ReadStaffNumbers = browserReadStaffNumbers,
): ParsedMore | null {
  const [more, setMore] = useState<ParsedMore | null>(null);
  useEffect(() => {
    let current = true;
    let asked = 0;
    const ask = () => {
      const mine = ++asked;
      void read(address).then((reply) => {
        // Only the newest answer counts, and none once the page has gone.
        if (!current || mine !== asked) return;
        setMore(reply !== null && reply.page === page ? reply : null);
      });
    };
    const leaving = () => {
      // Taken off before the browser keeps the page, so it is not kept with them.
      asked += 1;
      flushSync(() => setMore(null));
    };
    const shown = (event: PageTransitionEvent) => {
      if (event.persisted) ask();
    };
    const seen = () => {
      if (document.visibilityState === 'visible') ask();
    };
    ask();
    window.addEventListener('pagehide', leaving);
    window.addEventListener('pageshow', shown);
    document.addEventListener('visibilitychange', seen);
    return () => {
      current = false;
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('pageshow', shown);
      document.removeEventListener('visibilitychange', seen);
    };
  }, [address, page, read]);
  return more;
}
