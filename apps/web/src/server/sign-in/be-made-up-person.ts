// "Be this made-up person" (step 2.96): LOCAL WORK AND TESTS ONLY. Its action asks the
// gate first (local-only.ts) and answers "not found" outside local and test.
//
// It makes no session of its own. The form sends only which made-up person (a key); how
// that person signs in is read here on the server (LocalTools.madeUpSignInOf), and the
// sign-in runs through the ordinary flows on the sign-in stand-in, so the session is one
// the password form or the code screens would have made:
// - on the made-up stand-in, the person's made-up password through signInWithPassword;
// - on the made-up database, an emailed code: askForCode as the sign-up form asks it,
//   the code read from the capture in memory, and enterCode as the code screen sends it;
//   the browser is then on "Choose your password", as after any sign-up. Only the code
//   that ask sent is ever given: when none comes in time, the browser goes back to the
//   list with a plain sentence, and no earlier code is tried (it would fail and use up an
//   attempt).
import { platformUrl } from '@srleagues/core';
import { noNewCode, type LocalTools } from '../local-tools.ts';
import type { Visit } from './device.ts';
import {
  askForCode,
  botCheckFieldsDrawn,
  enterCode,
  signInWithPassword,
  type FlowAnswer,
  type FlowDeps,
} from './flows.ts';

type Fields = Readonly<Record<string, string | undefined>>;

/**
 * Signs this browser in as the made-up person the form names; null when there is no such
 * made-up person (the action answers "not found").
 */
export async function beMadeUpPerson(
  fields: Fields,
  visit: Visit,
  deps: FlowDeps,
  tools: Pick<LocalTools, 'madeUpSignInOf' | 'watchForCode'>,
): Promise<FlowAnswer | null> {
  const chosen = tools.madeUpSignInOf(fields['person'] ?? '');
  if (chosen === undefined) return null;
  const next = fields['next'];
  // The form as the page draws it, with the bot check's stand-in answer (record 081).
  const drawn = botCheckFieldsDrawn(deps.botCheck.widget);
  if (chosen.kind === 'password') {
    return signInWithPassword(
      { ...drawn, email: chosen.email, password: chosen.password, next },
      visit,
      deps,
    );
  }
  // Watching before asking: the code taken is the one this ask sends, never an older one.
  const watch = tools.watchForCode(chosen.email);
  const asked = await askForCode('sign-up', { ...drawn, email: chosen.email, next }, visit, deps);
  if (asked.to !== platformUrl('enterCode')) {
    watch.stop();
    return asked;
  }
  const code = await watch.code();
  if (code === undefined) return { to: `${platformUrl('madeUpPeople')}?problem=${noNewCode}` };
  return enterCode({ code }, visit, deps);
}
