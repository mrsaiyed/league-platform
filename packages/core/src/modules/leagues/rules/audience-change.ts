// What changing who plays in a league does (step 2.125 part 2, R-14, R-29), worked out
// once so the screen can say it before the save and the command does exactly that.
//
// Moving toward adults (under-18s to both, or either to adults) shows more of the
// people whose age we do not know, so it asks for the same confirmation as switching
// to full names (R-14); moving the other way never asks (area 5 review of part 1,
// 2026-11-14). Moving away from adults while the league holds a saved, confirmed "full
// names" for children would apply it to the new children: the change clears that
// setting back to the league's starting value (no) instead (step 2.162's builder).
//
// S-96 (step 2.125 fix round): any move that brings children into an adult league (to
// under-18s or both) also puts back the other privacy choices a youth league confirms
// before publishing (P3 section 3): a saved "full names" choice is cleared (the start, so
// it must be confirmed again) and the listing goes off (U-10's youth start). A saved
// choice that already shows less than the start is kept: a clearing never shows more.
import type { Audience } from '../league-values.ts';

/** From the fewest adults shown in full to the most. */
const towardAdults: Readonly<Record<Audience, number>> = { youth: 0, mixed: 1, adult: 2 };

export type AudienceChange = {
  /** The admin must tick the confirmation before it is saved. */
  readonly needsConfirming: boolean;
  /** Saving it clears the confirmed "children in full" back to no. */
  readonly clearsChildrenInFull: boolean;
  /** Children come into an adult league: the youth starting choices are put back (S-96). */
  readonly bringsChildrenIn: boolean;
};

export function audienceChange(
  from: Audience,
  to: Audience,
  childrenInFullConfirmed: boolean,
): AudienceChange {
  return {
    needsConfirming: towardAdults[to] > towardAdults[from],
    clearsChildrenInFull: from === 'adult' && to !== 'adult' && childrenInFullConfirmed,
    bringsChildrenIn: from === 'adult' && to !== 'adult',
  };
}
