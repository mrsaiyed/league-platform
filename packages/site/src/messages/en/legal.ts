// English interface text (T-187), one part of `en`, which ../en.ts joins:
// The Terms and Privacy pages until the lawyer's versions exist (B-14, step 2.135): a
// short plain note, worded by the lead, that makes no legal promise. The founder can
// change any word here. When a word changes, `legal.lastChanged` changes with it.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
export const enLegal = {
  'legal.backTo': 'Back to {league}',
  // Who to write to, the same on both pages: the league's admin first, then us. The
  // address, drawn after `legal.contact.site` as a link, is the CONTACT_EMAIL setting of the
  // site; where none is set, `legal.contact.siteThroughLeague` is said instead.
  'legal.contact.league': "Write to your league's admin first. They run your league.",
  'legal.contact.site': 'If they cannot help, write to the people who run SR Leagues:',
  'legal.contact.siteThroughLeague':
    'If they cannot help, ask them to pass your question on to the people who run SR Leagues.',
  'legal.contact.title': 'Who to write to',
  'legal.lastChanged': 'Last changed on 22 November 2026.',
  'legal.privacy.children.body':
    "A player the league knows to be under 18 is shown on public pages by first name and last initial, such as “Sam K.”, unless the league's admin has confirmed that the parents agreed to full names. In a youth league, a player whose age the league does not know is shown the same way.",
  'legal.privacy.children.less':
    "The league's admin decides who sees each team's statistics, or lets each team decide. A parent can ask the admin to show their child by initials only, or to take the name off the public pages and keep only the numbers.",
  'legal.privacy.children.title': 'Children',
  'legal.privacy.keep.account':
    'For your account: your email address, the leagues you belong to and what you do in each, such as admin or scorekeeper. Your password is held by our sign-in service in a scrambled form that cannot be read back.',
  'legal.privacy.keep.cookies':
    "Cookies and your browser's own storage are used only to keep you signed in, to remember your team if you pick one, and to keep a game being scored safe on the scorekeeper's device. No advertising or tracking cookies.",
  'legal.privacy.keep.devices':
    "The devices you are signed in on: the browser, the kind of device and when you last used it. Your account page lists them and can sign them all out. A scorekeeper's phone or computer holds the game being scored until it is saved.",
  'legal.privacy.keep.invited':
    'If you are invited to help run a league: your email address and who invited you.',
  'legal.privacy.keep.log':
    "A record of the changes made in each league's admin area, and who made them; and the network address each sign-in attempt comes from, so that someone guessing passwords can be stopped.",
  'legal.privacy.keep.players':
    "For players: name, team, jersey number, games played and statistics. A league can also keep a player's date of birth and email address.",
  'legal.privacy.keep.title': 'What we keep',
  'legal.privacy.remove.body':
    'There is no button yet to close your account. To have it closed and what we keep about you deleted, ask us as “Who to write to” says below.',
  'legal.privacy.remove.league':
    "A league's admin can take a player off the league's list, and the player then no longer appears on its pages. Anyone who was ever on a team's list stays in the league's records, and the games they played keep their numbers. To have what a league keeps about you or your child deleted, ask the league's admin or write to us.",
  'legal.privacy.remove.title': 'Taking it off',
  'legal.privacy.sell.body':
    'We do not sell your information, and the site shows no advertising. Besides your league and us, it goes only to the services the site runs on: its hosting, its database, signing in, checking that sign-ins are made by people, and sending email. If you sign in with Google, Google knows that you signed in here and tells us your email address.',
  'legal.privacy.sell.title': 'We do not sell it',
  'legal.privacy.who.admins':
    "Your league's admins can see everything the league keeps about its players. The people who run SR Leagues can see it too, to keep the site working and fix problems.",
  'legal.privacy.who.never':
    "A player's email address and date of birth are never on a public page.",
  'legal.privacy.who.public':
    "Everyone can see what a league shows on its public pages: teams, rosters, scores, standings and players' statistics. A team can keep its players' statistics to its own staff and the league's admins.",
  'legal.privacy.who.title': 'Who can see it',
  'legal.privacy.why.body':
    "Only to run your league's site: to sign you in, to show teams, games and results, and to let each league's admins run their league.",
  'legal.privacy.why.title': 'Why we keep it',
  'legal.readPrivacy': 'Read the privacy note',
  'legal.readTerms': 'Read the terms',
  'legal.shortVersion':
    'This is the short version, for the first season of our own leagues. Full terms and a privacy policy, checked by a lawyer, will replace this page before anyone outside our own leagues signs up.',
  'legal.terms.account.body':
    "Use your own email address and keep your password to yourself. If you think someone else has used your account, press “Sign out everywhere” on your account page and tell your league's admin.",
  'legal.terms.account.title': 'Your account',
  'legal.terms.enter.body':
    "Enter only what is true and what you have the right to share. Scores and statistics you enter appear on the league's pages, for everyone the league shows them to.",
  'legal.terms.enter.title': 'What you enter',
  'legal.terms.league.body':
    "Each league's admin decides who helps run it, who scores its games and what its public pages show. A question about a league goes to its admin first.",
  'legal.terms.league.title': 'Your league decides',
  'legal.terms.new.body':
    "The site is new and still being built. Some pages are not finished, and things will change as it grows. If something looks wrong, tell your league's admin.",
  'legal.terms.new.title': 'A new site',
  'legal.terms.what.body':
    "SR Leagues gives sports leagues a website: public pages for teams, games and results, and a private area where each league's admins run it. Each league is run by its own admins, not by us.",
  'legal.terms.what.title': 'What this site is',
} as const;
