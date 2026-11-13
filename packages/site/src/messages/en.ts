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
  'footer.label': 'Footer',
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
  // Why a season's roster settings were refused (T-187): `error.`, the command's name,
  // the code, and the setting at fault when there is one.
  'error.leagues.set_season_roster_settings.invalid-rules': 'These roster settings are not valid.',
  'error.leagues.set_season_roster_settings.invalid-rules.minSize':
    'The smallest roster is not a valid number.',
  'error.leagues.set_season_roster_settings.invalid-rules.maxSize':
    'The largest roster is not a valid number, or is smaller than the smallest.',
  'error.leagues.set_season_roster_settings.invalid-rules.locksOn':
    'The day rosters lock is not a valid date.',
  // Why a roster change was refused (T-187).
  'error.teams.add_to_roster.team-not-found': 'That team is not there.',
  'error.teams.add_to_roster.person-not-found': 'That person is not in the league list.',
  'error.teams.add_to_roster.already-on-team': 'That person is already on this team.',
  'error.teams.add_to_roster.jersey-taken':
    'Another player on this team already wears that number. This season asks for a different number for each player.',
  'error.teams.change_roster_entry.jersey-taken':
    'Another player on this team already wears that number. This season asks for a different number for each player.',
  'error.teams.change_roster_entry.already-left':
    'This person has left the team, so their entry can no longer be changed.',
  'error.teams.mark_left.already-left': 'This person is already marked as having left.',
  'error.teams.mark_left.left-before-joined': 'The leaving date is before the day they joined.',
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
  'activity.leagues.update_season': 'Changed a season',
  'activity.leagues.set_season_rules': "Changed a season's rules",
  'activity.leagues.set_season_roster_settings': "Changed a season's roster settings",
  'activity.leagues.create_division': 'Added a division',
  'activity.leagues.update_division': 'Changed a division',
  'activity.leagues.reorder_divisions': 'Changed the order of the divisions',
  'activity.leagues.remove_division': 'Moved a division to the bin',
  'activity.leagues.restore_division': 'Restored a division from the bin',
  'activity.games.record_final_score': 'Recorded a final score',
  'activity.games.record_forfeit': 'Recorded a forfeit',
  'activity.games.postpone_game': 'Postponed a game',
  'activity.games.cancel_game': 'Cancelled a game',
  'activity.games.reopen_game': 'Reopened a final game to correct it',
  'activity.people.create_person': 'Added a person',
  'activity.people.update_person': 'Changed a person',
  'activity.people.remove_person': 'Moved a person to the bin',
  'activity.teams.create_team': 'Added a team',
  'activity.teams.update_team': 'Changed a team',
  'activity.teams.remove_team': 'Moved a team to the bin',
  'activity.teams.set_stats_visibility': "Changed who sees a team's players' numbers",
  'activity.teams.add_to_roster': 'Added a person to a roster',
  'activity.teams.change_roster_entry': "Changed a player's number or role",
  'activity.teams.reorder_roster': 'Changed the order of a roster',
  'activity.teams.mark_left': 'Marked a person as having left a team',
  'activity.scheduling.create_venue': 'Added a venue',
  'activity.scheduling.update_venue': 'Changed a venue',
  'activity.scheduling.remove_venue': 'Moved a venue to the bin',
  'activity.scheduling.restore_venue': 'Restored a venue from the bin',
  'activity.scheduling.create_court': 'Added a court',
  'activity.scheduling.update_court': 'Changed a court',
  'activity.scheduling.remove_court': 'Moved a court to the bin',
  'activity.scheduling.restore_court': 'Restored a court from the bin',
  'activity.leagues.set_setting': 'Changed a setting',
  'activity.leagues.clear_setting': 'Went back to the default for a setting',
  // Setting labels (T5 §6, T-98): `setting.<key>.label`, shown on the admin screen.
  'setting.members.startPage.label':
    'Where members land first: the league home or their own team page',
  // The words for that setting's choices: `setting.<key>.option.<choice>`.
  'setting.members.startPage.option.leagueHome': 'The league home',
  'setting.members.startPage.option.myTeam': 'Their own team page',
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
