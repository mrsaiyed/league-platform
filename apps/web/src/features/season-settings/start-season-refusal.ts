// The sentence a refused start form says (step 2.245): beside the box it is about, naming
// it ("Short name: …"); about no box, the command's own words beside the button.
import type { TextKey } from '../../server/messages.ts';
import { problemKey } from './answer.ts';
import type { StartField } from './run-start-season.ts';

export function startRefusalKey(code: string, field: StartField | undefined): TextKey {
  if (field === undefined) {
    return problemKey({ problem: `leagues.start_season.${code}` }) ?? 'error.unknown';
  }
  if (field === 'slug' && code === 'season-slug-taken') {
    return 'seasonSettings.start.refused.slug-taken';
  }
  return `seasonSettings.start.refused.${field}`;
}
