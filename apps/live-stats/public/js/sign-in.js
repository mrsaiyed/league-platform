// Scorer sign-in with the shared passcode, then back to where the scorer was going.
import { api, getSession, siteHeader } from '/js/common.js';

const $ = (id) => document.getElementById(id);
// Only a path on this site, never another site's address.
const asked = new URLSearchParams(location.search).get('next') ?? '/';
const next = /^\/(?!\/)/.test(asked) ? asked : '/';

async function start() {
  const session = await getSession();
  const schedule = await api('/api/schedule').catch(() => null);
  $('site-header').innerHTML = siteHeader('sign-in', schedule?.team?.id, session);
  if (session.canScore) return location.replace(next);
  if (!session.signIn) {
    $('intro').textContent =
      'Sign-in is not set up on this server. Scoring works on the computer running it.';
    $('form').hidden = true;
    return;
  }
  $('passcode').focus();
  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = $('form').querySelector('button');
    button.disabled = true;
    $('error').textContent = '';
    try {
      await api('/api/session', { method: 'POST', body: { passcode: $('passcode').value } });
      location.replace(next);
    } catch (err) {
      $('error').textContent = err.message;
      $('passcode').select();
    } finally {
      button.disabled = false;
    }
  });
}
void start();
