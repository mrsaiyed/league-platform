'use server';
// The Admins page's server actions (step 2.97, P4 §4). Who is asking and which league come
// from the session and the address (loadLeaguePage: someone who may not open League
// settings is refused before anything runs), never from the form; the form says only what
// to do and to which invitation or role. Each runs the access module's own command, which
// checks again who may do it (T-74) and writes the activity log entry (A-6).
//
// How a form is answered (T-271, record 067; nothing rides in the address): refused, in the
// response to the post itself, with what was typed and the wrong box marked; done, a
// one-time notice is left for the page (server/saved-notice.ts) and the page is drawn
// again (with scripts on, in the answer to the post; with scripts off, after a redirect to
// the part of the page the change is about). A form sent twice is answered as the first
// (server/same-request.ts). Removing one's own access leaves the page for the league's home.
import {
  cancelInvitation,
  invite,
  leagueScope,
  leagueUrl,
  myAccess,
  resendInvitation,
  revokeGrant,
  type CommandContext,
} from '@srleagues/core';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { typedOf, type FormState, type TypedFields } from '../list-forms/form-state.ts';
import { adminsAnchors } from './admins-anchors.ts';
import { problemKeyOf, wrongInviteFields } from './access-words.ts';

/** What one save answers: done (with where its notice is said), or refused. */
type Outcome =
  | { readonly kind: 'done'; readonly thing: string; readonly said: string; readonly at: string }
  | { readonly kind: 'refused'; readonly code: string; readonly wrong: readonly string[] }
  | { readonly kind: 'left' };

const requests = () => sameRequestsHere<Outcome>();

async function adminsOf(fields: TypedFields) {
  // The route's league only finds the page again; the gate checks it against the address
  // the proxy wrote down, and the context below is built from that.
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'settings');
  const league = view.context.league;
  return {
    context: commandContextOf(view.context),
    league,
    page: leagueUrl(league, 'admin-area', { area: 'settings', subpath: ['admins'] }),
  };
}

const refusedWith = (code: string, typed: TypedFields, wrong: readonly string[]): FormState => ({
  kind: 'refused',
  code,
  typed,
  wrong,
  said: t(problemKeyOf(code, wrong)),
});

/** Runs one save once, answers it: refused in place, or done with its notice. */
async function answer(
  context: CommandContext,
  fields: TypedFields,
  typed: TypedFields,
  page: string,
  home: string,
  work: () => Promise<Outcome>,
): Promise<FormState> {
  const outcome = await requests().once(requestKeyOf(context, fields), work);
  if (outcome.kind === 'refused') {
    // Something on the page may have changed (an invitation accepted meanwhile): the page
    // is drawn again as it is now, keeping what was typed (A-8).
    if (outcome.code !== 'invalid-input' && outcome.code !== 'confirm') refresh();
    return refusedWith(outcome.code, typed, outcome.wrong);
  }
  if (outcome.kind === 'left') return redirect(home);
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen: 'admins',
      thing: outcome.thing,
      said: outcome.said,
    });
  }
  // Next.js's own header on a post its scripts send; a form sent by the browser has none.
  if ((await headers()).has('next-action')) {
    refresh();
    return { kind: 'untouched' };
  }
  return redirect(`${page}#${outcome.at}`);
}

/** Invites an address to a role for the whole league (P4 §4). */
export async function inviteAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, league, page } = await adminsOf(fields);
  const typed = { email: fields['email'] ?? '', role: fields['role'] ?? '' };
  const ports = (await webPorts()).adminAccess;
  return answer(context, fields, typed, page, leagueUrl(league, 'home'), async () => {
    const result = await invite(
      context,
      { email: typed.email, role: typed.role, scope: leagueScope },
      ports.deps,
    );
    if (!result.ok) {
      const issues = 'issues' in result.error ? result.error.issues : [];
      return {
        kind: 'refused',
        code: result.error.code,
        wrong: wrongInviteFields(result.error.code, issues),
      };
    }
    // The worker sends the email; on the made-up database the app does it now.
    await ports.sendQueuedInvitations?.();
    return {
      kind: 'done',
      thing: result.value.invitationId,
      said: 'invited',
      at: adminsAnchors.invitation(result.value.invitationId),
    };
  });
}

/** Sends an invitation again with a new link; the one before stops working (T-226). */
export async function resendAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, league, page } = await adminsOf(fields);
  const invitationId = fields['invitation'] ?? '';
  const ports = (await webPorts()).adminAccess;
  return answer(context, fields, {}, page, leagueUrl(league, 'home'), async () => {
    const result = await resendInvitation(context, { invitationId }, ports.deps);
    if (!result.ok) return { kind: 'refused', code: result.error.code, wrong: [] };
    await ports.sendQueuedInvitations?.();
    return {
      kind: 'done',
      thing: result.value.invitationId,
      said: 'resent',
      at: adminsAnchors.invitation(result.value.invitationId),
    };
  });
}

/** Cancels an invitation: its link stops working at once. */
export async function cancelAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, league, page } = await adminsOf(fields);
  const invitationId = fields['invitation'] ?? '';
  const ports = (await webPorts()).adminAccess;
  return answer(context, fields, {}, page, leagueUrl(league, 'home'), async () => {
    const result = await cancelInvitation(context, { invitationId }, ports.deps);
    if (!result.ok) return { kind: 'refused', code: result.error.code, wrong: [] };
    return { kind: 'done', thing: 'invitations', said: 'cancelled', at: adminsAnchors.invitations };
  });
}

/**
 * Removes one role from someone, after the box saying so is ticked: it ends at once, for
 * every session they have (T-75: every command reads access afresh). Someone who removes
 * their own last way into League settings is sent to the league's home.
 */
export async function removeAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const { context, league, page } = await adminsOf(fields);
  const grantId = fields['grant'] ?? '';
  const ports = (await webPorts()).adminAccess;
  return answer(context, fields, {}, page, leagueUrl(league, 'home'), async () => {
    if (fields['confirm'] !== 'yes')
      return { kind: 'refused', code: 'confirm', wrong: ['confirm'] };
    const result = await revokeGrant(context, { grantId }, ports.deps);
    if (!result.ok) return { kind: 'refused', code: result.error.code, wrong: [] };
    const left = await myAccess(context, {}, ports.deps);
    const stillManages = left.ok && left.value.leaguePermissions.includes('access.manage');
    if (!stillManages) return { kind: 'left' };
    return { kind: 'done', thing: 'people', said: 'removed', at: adminsAnchors.people };
  });
}
