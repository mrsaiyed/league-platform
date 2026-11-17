import { cookies } from 'next/headers';
import {
  RefusalFresh,
  RefusalPage,
  refusalScreenOf,
  StandalonePage,
} from '../features/shell/index.ts';
import { isStaffAddress, StaffFrame } from '../features/staff/index.ts';
import type { LeagueView } from '../server/league-gate.ts';
import { siteOfThisRequest } from '../server/league-site.ts';
import {
  leagueViewOfAddress,
  requestPath,
  rolesHere,
  signedInEmail,
  staffViewOfAddress,
} from '../server/load-league-page.ts';
// The admin's frame is drawn here for a refusal inside an admin that is open to the person
// (below), so this screen brings the frame's stylesheet with it. Next.js attaches it to
// this screen alone: it is loaded only when the refusal is drawn, never by a public page.
import './[league]/admin/staff.css';

/** A read for this screen that cannot be made just now draws it as if there were nothing. */
async function orNull<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** The league's public name, for "Back to {league}", when it may be shown to this person. */
async function nameOf(view: LeagueView | null): Promise<string | null> {
  if (view === null) return null;
  const league = view.context.league;
  return (await siteOfThisRequest(league.id, league.slug)).name;
}

/**
 * "You do not have access" (U-6): the address shows where you asked to go; it never proves
 * you may. Status 403. What it says and where it leads are worked out for the person who
 * is looking, from the session and what the league's gate knows they hold here
 * (features/shell/refusal-screen.ts, step 2.157): a visitor is asked to sign in (most staff
 * pages send them to sign in before this, U-15); staff of this league read that their role
 * does not include the page, and go back to the admin; anyone else signed in reads that
 * this account does not help run the league, and goes back to its home. Everyone signed in
 * is told which account they are signed in as and can use another, which brings them back
 * here (step 2.127). Nobody signed in is offered "Sign in".
 *
 * A league that may not be shown to this person never reaches this screen: the gate
 * answers "not found" for it, exactly as for a league that does not exist (U-9), and
 * then this screen, which Next.js draws into every page, says nothing of any league.
 *
 * Staff at an admin address meet it inside the admin's own frame, in the league's
 * workspace, as "Page not found" inside the admin is (docs/build/DESIGN.md section 4,
 * lines 19 and 20): they are already inside that admin, so the frame tells them nothing
 * they may not know. Everyone else meets it on SR Leagues' own plain screen, with no
 * league frame (U-9); the mark (U-8) belongs to pages a league shows.
 *
 * The session is read once per request, shared with the page (this-request.ts); if it
 * cannot be read the screen is a visitor's. Next.js keeps this screen from the last whole
 * page it sent; when it comes into view after the browser moved on without one, nothing
 * is drawn until it has been drawn again for whoever is signed in now (RefusalFresh,
 * features/shell/refusal-fresh.tsx). Staff are told their own roles in this league.
 */
export default async function Forbidden() {
  // Next.js draws this screen into every page it sends, before it is known whether the
  // page refuses. Reading the session cookie first makes every page that carries it drawn
  // per request, never at build time or kept for others: this screen can name the person.
  await cookies();
  const email = await signedInEmail();
  const path = await requestPath();
  const view = email === null ? null : await orNull(leagueViewOfAddress);
  const screen = refusalScreenOf({
    email,
    view,
    leagueName: await orNull(() => nameOf(view)),
    path,
    roles: email === null ? [] : ((await orNull(rolesHere)) ?? []),
  });
  const staff =
    screen.kind === 'staff' && view !== null && isStaffAddress(view.context.league, path)
      ? await orNull(staffViewOfAddress)
      : null;
  // RefusalFresh is outermost in both, so a copy kept from an earlier load (the admin's
  // frame of the person signed in before, say) is never drawn while the fresh one comes.
  if (staff !== null) {
    return (
      <RefusalFresh>
        <StaffFrame view={staff}>
          <RefusalPage screen={screen} />
        </StaffFrame>
      </RefusalFresh>
    );
  }
  return (
    <RefusalFresh>
      <StandalonePage>
        <RefusalPage screen={screen} />
      </StandalonePage>
    </RefusalFresh>
  );
}
