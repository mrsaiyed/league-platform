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
  // The web app's shell (step 1.17). Pages not built yet say so plainly.
  'shell.siteName': 'SR Leagues',
  'shell.notBuilt': 'This page is not built yet.',
  'shell.draftNotice': 'This league is not published. Only the people who run it can see it.',
  'shell.suspendedNotice':
    'This league has been taken down. Only the people who run it can see it, to export their data.',
  'shell.archivedNotice': 'This league is archived. Everything here is kept as it was.',
  // Our own pages (P2 §4).
  'page.home': 'Find your league, or start one',
  'page.find': 'Find a league',
  'page.start': 'Start a league',
  'page.signIn': 'Sign in',
  'page.account': 'Your account',
  'page.inbox': 'Your notifications',
  'page.help': 'Help',
  'page.contact': 'Contact us',
  'page.terms': 'Terms',
  'page.privacy': 'Privacy',
  'page.status': 'Service status',
  // A league's public site (P2 §4).
  'nav.stats': 'Stats',
  'nav.register': 'Register',
  'nav.my': 'My team',
  'nav.news': 'News',
  'page.team': 'Team',
  'page.player': 'Player',
  'page.game': 'Game',
  'page.newsPost': 'News',
  // The admin (P4 §3).
  'admin.title': 'Admin',
  'admin.areasLabel': 'Admin areas',
  'admin.area.home': 'Home',
  'admin.area.registration': 'Registration',
  'admin.area.people': 'People',
  'admin.area.teams': 'Teams',
  'admin.area.schedule': 'Schedule',
  'admin.area.games': 'Games',
  'admin.area.standings': 'Standings and stats',
  'admin.area.site': 'Site',
  'admin.area.messages': 'Messages',
  'admin.area.season': 'Season settings',
  'admin.area.settings': 'League settings',
  'admin.emptyArea': 'Nothing here yet.',
  'admin.viewSite': 'View the site',
  // U-6: an address you are not allowed to open.
  'access.noAccess.title': 'You do not have access',
  'access.noAccess.body':
    'This page is for the people who run this league. If you should have access, ask the league to invite you.',
  // The courtside tracker (P2 §4), rebuilt here in a later step.
  'tracker.title': 'Score a game',
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
