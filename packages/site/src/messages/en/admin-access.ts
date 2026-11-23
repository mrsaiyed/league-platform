// English interface text (T-187), one part of `en`, which ../en.ts joins:
// the Admins page of League settings and the invitation's accept page (step 2.97).
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key.
export const enAdminAccess = {
  // The link from Admins to the activity log's own screen (step 2.77).
  'adminAccess.activity.all': 'See the whole activity log',
  'adminAccess.activity.none': 'No one has been invited or removed yet.',
  'adminAccess.activity.someone': 'Someone without access now',
  'adminAccess.activity.title': 'Latest changes',
  'adminAccess.cancel': 'Cancel invitation',
  // {role}: a role's name, given for one program of the league only.
  'adminAccess.forOneProgram': '{role}, for one program',
  'adminAccess.fromSettings': 'Invite someone to help run the league, or remove their access.',
  'adminAccess.intro': 'The people who help run the league, and the invitations still open.',
  'adminAccess.invitation.expired': 'Ran out',
  'adminAccess.invitation.ranOut': 'The link has run out. Send it again to give them a new one.',
  // {date}: the day the link stops working, in the league's time zone.
  'adminAccess.invitation.until': 'The link works until {date}.',
  'adminAccess.invitation.waiting': 'Waiting',
  'adminAccess.invitations.none':
    'No invitations are waiting. Someone you invite is listed here until they accept.',
  'adminAccess.invitations.title': 'Invitations not yet accepted',
  'adminAccess.invite.body':
    'They get an email with a link. They sign in, or create an account, and accept it. The link works for {days} days.',
  'adminAccess.invite.chooseRole': 'Choose a role',
  'adminAccess.invite.email': 'Their email address',
  'adminAccess.invite.role': 'Role',
  'adminAccess.invite.roles': 'What each role can do',
  'adminAccess.invite.submit': 'Send the invitation',
  'adminAccess.invite.title': 'Invite someone',
  // The activity log's screen (step 2.77, A-6): filters, paging, and what an entry adds.
  'adminAccess.log.any': 'Anyone',
  'adminAccess.log.anyKind': 'Everything',
  'adminAccess.log.binLink': 'It is in the bin: bring it back',
  'adminAccess.log.clear': 'Show everything',
  'adminAccess.log.filter': 'Show',
  'adminAccess.log.filters': 'Choose what the log shows',
  'adminAccess.log.from': 'From',
  'adminAccess.log.intro': 'Who changed what in the league, and when. The newest change is first.',
  'adminAccess.log.kind': 'What was changed',
  'adminAccess.log.kind.access': 'Who has access',
  'adminAccess.log.kind.games': 'Games and results',
  'adminAccess.log.kind.people': 'People',
  'adminAccess.log.kind.schedule': 'Schedule',
  'adminAccess.log.kind.settings': 'Settings and seasons',
  'adminAccess.log.kind.standings': 'Standings',
  'adminAccess.log.kind.teams': 'Teams',
  'adminAccess.log.newer': 'Newer',
  'adminAccess.log.none': 'Nothing matches these choices. Try a wider one.',
  'adminAccess.log.noneAtAll': 'Nothing has been changed in the league yet.',
  'adminAccess.log.older': 'Older',
  'adminAccess.log.pages': 'More of the log',
  // {reason}: the words the person gave when they made the change.
  'adminAccess.log.reason': 'Why: {reason}',
  // A season's status entry says what visitors see now (from the reviews of step 2.93).
  'adminAccess.log.season.active': 'It is now shown to visitors.',
  'adminAccess.log.season.completed': 'It is now marked as finished.',
  'adminAccess.log.season.draft': 'It is now hidden from visitors.',
  'adminAccess.log.system': 'The league itself, overnight',
  'adminAccess.log.title': 'Activity log',
  'adminAccess.log.to': 'To',
  'adminAccess.log.who': 'Who',
  // A-14: someone on the list who has not given their name. Never their email address.
  'adminAccess.noName': 'No name yet',
  'adminAccess.owner': 'The owner can do everything, and cannot be removed here.',
  'adminAccess.people.title': 'People with access',
  'adminAccess.problem.already-invited':
    'This address already has an invitation to this role waiting. Use “Send again” on it below.',
  'adminAccess.problem.confirm': 'Tick the box first, to say you are sure.',
  'adminAccess.problem.email': 'Enter one email address, like name@example.com.',
  'adminAccess.problem.grant-already-revoked': 'That access had already been removed.',
  'adminAccess.problem.grant-not-found': 'That access had already been removed.',
  'adminAccess.problem.invitation-closed': 'That invitation was already accepted or cancelled.',
  'adminAccess.problem.invitation-not-found': 'That invitation is not there any more.',
  'adminAccess.problem.invitation-withdrawn':
    'The person who sent this invitation can no longer give this role, so it cannot be sent again. Cancel it, and invite them yourself.',
  'adminAccess.problem.league-read-only':
    'This league is archived or suspended, so no one new can join it.',
  'adminAccess.problem.not-allowed': 'You are not allowed to do that.',
  'adminAccess.problem.role': 'Choose one of the roles in the list.',
  'adminAccess.problem.unknown': 'That could not be done just now. Try again.',
  'adminAccess.remove.confirm': 'Yes, remove this access',
  'adminAccess.remove.open': 'Remove access',
  // {name}: the person's name, or "No name yet"; {role}: a role's name.
  'adminAccess.remove.question':
    '{name} will lose their access as {role} at once, on every device they use.',
  'adminAccess.remove.questionSelf':
    'You will lose your own access as {role} at once, and this page will close for you.',
  'adminAccess.remove.submit': 'Remove access',
  'adminAccess.resend': 'Send again',
  'adminAccess.roleAbout.admin':
    'Admin: everything the owner can do, except handing the league over, deleting it and its payout account.',
  'adminAccess.roleAbout.editor': 'Editor: the site, news, media, awards and sponsors.',
  'adminAccess.roleAbout.registrar': 'Registrar: registration and the list of people.',
  'adminAccess.roleAbout.scheduler': 'Scheduler: the schedule and the games.',
  'adminAccess.roleAbout.scorekeeper': 'Scorekeeper: scoring games, and nothing else.',
  'adminAccess.saved.cancelled': 'Invitation cancelled. Its link no longer works.',
  'adminAccess.saved.invited': 'Invitation sent. It is listed here until it is accepted.',
  'adminAccess.saved.removed': 'Access removed. It ended at once, on every device.',
  'adminAccess.saved.resent': 'Sent again, with a new link. The link sent before no longer works.',
  'adminAccess.title': 'Admins',
  'adminAccess.you': 'You',
  'invitation.accepted.body': 'You accepted this invitation already: you are {role} in {league}.',
  'invitation.accepted.go': 'Go to {league}',
  'invitation.accepted.title': 'Already accepted',
  'invitation.notUsable.body':
    'An invitation link works once, for 14 days, and stops working when it is cancelled or sent again. Ask the person who invited you to send it again.',
  'invitation.notUsable.home': 'Go to SR Leagues',
  'invitation.notUsable.title': 'This link does not work',
  'invitation.open.accept': 'Accept the invitation',
  'invitation.open.body': '{league} invites you to help run it as {role}.',
  'invitation.open.otherAddress':
    'This invitation was sent to a different email address. If you have an account with that address, use it instead.',
  'invitation.open.program': 'The role is for one of its programs.',
  'invitation.open.signedInAs':
    'You are signed in as {email}. Accepting gives this account the role.',
  'invitation.open.title': 'Join {league}',
  'invitation.title': 'Your invitation',
  'invitation.useAnother': 'Use another account',
  'invitation.visitor.body':
    'To see the invitation and accept it, sign in, or create an account if you do not have one. You will come straight back here.',
  'invitation.visitor.signIn': 'Sign in',
  'invitation.visitor.signUp': 'Create an account',
} as const;
