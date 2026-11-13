// English interface text (T-187). Components ask for a key; they never hold the words.
// Add a key here first; every other language must then have it too.
export const en = {
  'site.poweredBy': 'Powered by SR Leagues',
  'nav.home': 'Home',
  'nav.schedule': 'Schedule',
  'nav.standings': 'Standings',
  'nav.teams': 'Teams',
  'nav.signIn': 'Sign in',
  'nav.menu': 'Menu',
  'footer.terms': 'Terms',
  'footer.privacy': 'Privacy',
  'common.loading': 'Loading',
  'common.notFound': 'We could not find that page.',
  'schedule.games_one': '{count} game on {date}',
  'schedule.games_other': '{count} games on {date}',
  // The fixed roles (A-3, P4 §4), by the name the access module gives each.
  'role.owner': 'Owner',
  'role.admin': 'Admin',
  'role.registrar': 'Registrar',
  'role.scheduler': 'Scheduler',
  'role.editor': 'Editor',
  'role.scorekeeper': 'Scorekeeper',
  'role.club_admin': 'Club admin',
  'role.coach': 'Coach',
  'role.captain': 'Captain',
  // Activity log lines (A-6, T-226): the key is `activity.` and the command's name;
  // the values come from the entry's details. {role} is a role's name from above.
  'activity.access.invite': 'Invited someone as {role}',
  'activity.access.resend_invitation': 'Re-sent an invitation as {role}',
  'activity.access.cancel_invitation': 'Cancelled an invitation as {role}',
  'activity.access.accept_invitation': 'Joined as {role}',
  'activity.access.revoke_grant': "Removed someone's access as {role}",
  'activity.leagues.create': 'Created the league',
  'activity.leagues.set_name': "Changed the league's name",
  'activity.leagues.rename_short_name': "Changed the league's address to {slug}",
  'activity.leagues.set_status': "Changed the league's state to {status}",
  'activity.leagues.create_season': 'Added a season',
  'activity.leagues.set_current_season': 'Changed the current season',
  // The invitation email (P4 §4, T-226), built by packages/emails. {league} is the
  // league's name, {role} a role's name from above, {days} how long a link works.
  'email.invitation.subject': 'You are invited to help run {league}',
  'email.invitation.intro': 'You have been invited to help run {league} as {role}.',
  'email.invitation.action': 'Accept the invitation',
  'email.invitation.howTo':
    'Open the link, then sign in or create your account, and you are in. The link works once.',
  'email.invitation.expiry':
    'It stops working {days} days after the invitation was sent, or as soon as it is re-sent or cancelled.',
  'email.invitation.notExpected':
    'If you were not expecting this, you can ignore this email and nothing will happen.',
  'email.invitation.linkFallback':
    'If the button does not work, copy this address into your browser:',
  // The tracker's saved banner (T6 §4), chosen from the queue's status by
  // apps/web/src/features/tracker/queue-banner.ts.
  'tracker.queue.allSaved': 'All saved',
  'tracker.queue.waiting_one': '{count} action waiting to send',
  'tracker.queue.waiting_other': '{count} actions waiting to send',
  'tracker.queue.notSaved_one': '{count} action not saved',
  'tracker.queue.notSaved_other': '{count} actions not saved',
  'tracker.queue.storageFailed': 'This device could not save to its storage',
  'tracker.queue.separator': ' · ',
} as const;

export type MessageKey = keyof typeof en;
