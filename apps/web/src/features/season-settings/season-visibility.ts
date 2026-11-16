// Who can see a season, in the three states a season has (T3: draft, active, completed),
// and what "Show this season to visitors" and "Hide it again" change (step 2.182, A-18).
// Visitors see a season that is active or completed (list-public-seasons.ts). Showing
// makes a draft season active; hiding puts an active season back in draft. A completed
// season is over: it stays shown, and neither button is offered (its state belongs to
// step 2.130's archiving). No other state is made.
import type { SeasonStatus } from '@srleagues/core';

export type Visibility = 'hidden' | 'shown' | 'over';
export type VisibilityWish = 'show' | 'hide';

export function visibilityOf(status: SeasonStatus): Visibility {
  switch (status) {
    case 'draft':
      return 'hidden';
    case 'active':
      return 'shown';
    case 'completed':
      return 'over';
  }
}

/** The state the season is given, or undefined when that wish does not fit its state now. */
export function statusFor(status: SeasonStatus, wish: VisibilityWish): SeasonStatus | undefined {
  if (wish === 'show') return status === 'draft' ? 'active' : undefined;
  return status === 'active' ? 'draft' : undefined;
}

/** The one wish a season's state offers: show a hidden one, hide a shown one, none when over. */
export function wishOf(status: SeasonStatus): VisibilityWish | undefined {
  const visibility = visibilityOf(status);
  return visibility === 'hidden' ? 'show' : visibility === 'shown' ? 'hide' : undefined;
}

export function isVisibilityWish(value: string | undefined): value is VisibilityWish {
  return value === 'show' || value === 'hide';
}
