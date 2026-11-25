// Step 2.128: the name gate stands in identify, so a test that signs in as an account with no
// own profile yet (a new sign-up, or a member the made-up seed holds with no name) first has
// it answer the one name screen, as the person would, through the same port the screen uses.
// Only tests use it; the gate itself is tested in database-ports.test.ts and by the browser.
import type { WebPorts } from './ports.ts';

/** The made-up name an address gives, told apart by the part before the @ ("Made-up scorer"). */
export const madeUpNameOf = (email: string) => ({
  firstName: 'Made-up',
  lastName: email.split('@')[0] ?? email,
});

/** `identify(token)` once the account behind it has given `name` on the one screen. */
export async function identifyNamed(
  ports: Pick<WebPorts, 'identify' | 'ownName'>,
  token: string,
  name: { readonly firstName: string; readonly lastName: string } = {
    firstName: 'Made-up',
    lastName: 'Member',
  },
): ReturnType<WebPorts['identify']> {
  const accountId = await ports.ownName.accountOf(token);
  if (accountId !== undefined) {
    await ports.ownName.store.create(accountId, name);
  }
  return ports.identify(token);
}
