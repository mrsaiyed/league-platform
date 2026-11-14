import { PlatformNotFound } from '../features/shell/index.ts';

/**
 * An address that is no league's: the neutral "not found" (U-9). U-8's mark (terms, privacy,
 * "powered by") is carried by every page of a league that may be shown, in the league
 * layout, not here. A page that is not found inside a league has its own screen
 * (`[league]/not-found.tsx`).
 */
export default function NotFound() {
  return <PlatformNotFound />;
}
