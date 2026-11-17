// English interface text (T-187), one part of `en`, which ../en.ts joins:
// the admin's People screens (step 2.50): the league list, adding a person, one person's record.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
export const enAdminPeople = {
  'adminPeople.add.submit': 'Add to the league',
  'adminPeople.add.title': 'Add a person',
  'adminPeople.added':
    'Added to the league: {name}. They are on no team yet; a team’s page in Teams puts them on its roster.',
  'adminPeople.birthDate.check_one':
    'That date of birth makes them {count} year old today. Check the year; if it is right, tick the box and save again.',
  'adminPeople.birthDate.check_other':
    'That date of birth makes them {count} years old today. Check the year; if it is right, tick the box and save again.',
  'adminPeople.birthDate.checked': 'Yes, this date of birth is right',
  'adminPeople.details.title': 'Details',
  'adminPeople.empty':
    'Everyone in the league will be listed here: players, coaches and captains, on a team or not. Add the first person.',
  'adminPeople.field.birthDate': 'Date of birth (optional)',
  'adminPeople.field.birthDateHelp': 'Only if your league collects dates of birth.',
  'adminPeople.field.child': 'Child or adult',
  'adminPeople.field.child.adult': 'An adult (18 or over)',
  'adminPeople.field.child.child': 'A child (under 18)',
  'adminPeople.field.child.unknown': 'Not recorded',
  'adminPeople.field.childByDate':
    'The date of birth makes them a child, so they are treated as a child until their 18th birthday, whatever this choice says.',
  'adminPeople.field.childByTick':
    'The date of birth makes them an adult, but they are marked as a child, so they are treated as a child: shown with less on public pages. To show more, change this to “An adult”.',
  'adminPeople.field.childHelp': 'Children are shown with less on the league’s public pages.',
  'adminPeople.field.email': 'Email (optional)',
  'adminPeople.field.emailHelp': 'Nothing is sent to it yet.',
  'adminPeople.field.firstName': 'First name',
  'adminPeople.field.lastName': 'Last name',
  'adminPeople.list.label': 'Everyone in the league',
  'adminPeople.list.next': 'Next {count}',
  'adminPeople.list.previous': 'Previous {count}',
  'adminPeople.noMatch':
    'No one in the league matches that search. Check the spelling, or add them.',
  'adminPeople.person.sub':
    'Their details as the league keeps them. A change shows on every page of the league at once.',
  'adminPeople.private.body':
    'Only the league’s owner, admins and registrars see these. They are never shown on public pages.',
  'adminPeople.private.title': 'Private details',
  'adminPeople.readFailed':
    'The league list could not be read just now. Reload the page to try again.',
  'adminPeople.refused': 'Not saved. {problem}',
  'adminPeople.remove.body':
    'They come off the league list; the games they played and their numbers stay in the league’s history. The person is kept for 30 days; the screen to bring them back is not ready yet.',
  'adminPeople.remove.confirm': 'Yes, I am sure',
  'adminPeople.remove.submit': 'Remove from the league list',
  'adminPeople.remove.title': 'Remove from the league list',
  'adminPeople.removed':
    'Removed from the league list. The person is kept for 30 days; the screen to bring them back is not ready yet.',
  'adminPeople.save.submit': 'Save details',
  'adminPeople.saved': 'Saved: {name}.',
  'adminPeople.search.clear': 'Show everyone',
  'adminPeople.search.label': 'Search by name',
  'adminPeople.search.noEmail':
    'Search by a name. An email address is not searched here, so that it never ends up in the page’s address.',
  'adminPeople.search.submit': 'Search',
  'adminPeople.sub':
    'Everyone in the league, on a team or not. Find someone, fix their details or add someone new.',
  'adminPeople.wrong.birthDate': 'Type a real date of birth: not after today, and not before 1900.',
  'adminPeople.wrong.contactEmail': 'Type a whole email address, such as name@example.com.',
  'adminPeople.wrong.firstName': 'Type a first name, up to 100 letters.',
  'adminPeople.wrong.lastName': 'Type a last name, up to 100 letters.',
} as const;
