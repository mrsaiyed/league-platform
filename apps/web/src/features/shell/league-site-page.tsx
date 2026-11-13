import { loadLeaguePage } from '../../server/load-league-page.ts';
import type { TextKey } from '../../server/messages.ts';
import { NotBuilt } from './not-built.tsx';

/** One page of a league's public site, shown only to those who may see the league (U-9). */
export async function LeagueSitePage({ title }: { readonly title: TextKey }) {
  await loadLeaguePage('site');
  return <NotBuilt title={title} />;
}
