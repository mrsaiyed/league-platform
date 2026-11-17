// English interface text (T-187), one part of `en`, which ../en.ts joins:
// Accounts, signing in and who holds what.
// Keys in alphabetical order: a new key goes in its place, never at the end (step 2.188).
// A comment above a key is about that key or, from before the split, about the keys
// that followed it in the one file there was.
export const enAccount = {
  'access.noAccess.body':
    'This page is for the people who run this league. If you should have access, ask the league to invite you.',
  'access.noAccess.signedInAs': 'You are signed in as {email}.',
  'access.noAccess.switch': 'Use another account',
  // U-6: an address you are not allowed to open.
  'access.noAccess.title': 'You do not have access',
  'account.alreadySignedOutNotice':
    'This device was already signed out. To sign out your other devices, sign in and choose "Sign out everywhere" again.',
  'account.devices': 'Signed-in devices',
  'account.devicesUnreadable':
    'We could not read the list of devices just now. Reload the page to try again.',
  'account.lastActive': 'Last active {when}',
  'account.leagues': 'Your leagues',
  'account.leaguesEmpty':
    'The leagues you belong to will be listed here, with your role in each, once a league adds you.',
  'account.menu': 'Your account menu',
  'account.menu.account': 'Your account',
  'account.menu.admin': 'Admin',
  'account.menu.myGames': 'My games to score',
  'account.problem.addressRefused':
    'You are signed in, but we cannot open an account for this email address. Nothing has been lost, and we have noted it. Please contact us, or sign out and sign in with another email address.',
  'account.problem.linkConflict':
    'You are signed in, but your email address belongs to an account that is joined to a different sign-in. Nothing has been lost: this needs putting right on our side, and we have noted it. Please contact us. Until then, you can sign out here.',
  'account.problem.notConfirmed':
    'You are signed in, but your email address has not been confirmed yet, so we cannot open your account. Sign out, then sign in again. If this keeps happening, please contact us.',
  'account.problem.title': 'We cannot open your account',
  'account.role.on-a-team': 'On a team',
  'account.signInOrCreate': 'Sign in or create an account',
  'account.signOut': 'Sign out',
  'account.signOutEverywhere': 'Sign out everywhere',
  'account.signOutEverywhereAsk': 'Sign out every device that uses your account, this one too?',
  'account.signOutEverywhereConfirm': 'Yes, sign out everywhere',
  'account.signOutEverywhereHelp': 'Signs out every device that uses your account, this one too.',
  'account.signOutEverywhereKeep': 'No, keep them signed in',
  // Signing out with a game open on the device and plays not yet sent (step 2.127).
  'account.signOutWaiting_one':
    '{count} play is not sent yet. It stays on this device and is sent when you sign in again. Sign out?',
  'account.signOutWaiting_other':
    '{count} plays are not sent yet. They stay on this device and are sent when you sign in again. Sign out?',
  // Finding one's way when signed in (step 2.127): the account button at the top right of
  // every league page (U-8), the account page's leagues, the front page.
  'account.signedInAs': 'Signed in as {email}',
  'account.signedInAt': 'Signed in {when}',
  'account.signedOutEverywhereNotice': 'You are signed out on every device that used your account.',
  'account.signedOutNotice': 'You are signed out.',
  'account.thisDevice': 'This device',
  'account.when.day': '{date} at {time}',
  'account.when.today': 'today at {time}',
  'account.when.yesterday': 'yesterday at {time}',
  'code.again': 'Send a new code',
  'code.changeAddress': 'Change it',
  'code.label': 'Code',
  'code.sentAgain': 'We sent a new code to {email}. Use the newest one.',
  'code.sentAgainReset': 'If {email} has an account, we sent it a new code. Use the newest one.',
  'code.sentReset': 'If {email} has an account, we sent it a code. It works for {minutes} minutes.',
  'code.sentSignUp': 'We sent a 6-digit code to {email}. It works for {minutes} minutes.',
  'code.submit': 'Continue',
  'code.title': 'Enter your code',
  'code.wrongAddress': 'Wrong address?',
  'confirm.google': 'Sign in with Google again',
  'confirm.intro': 'This needs your password when you have not entered it in the last hour.',
  'confirm.submit': 'Continue',
  'confirm.title': 'Enter your password again',
  'device.label': '{browser} on {system}',
  'device.unknown': 'A web browser',
  'email.invitation.action': 'Accept the invitation',
  'email.invitation.expiry':
    'It stops working {days} days after the invitation was sent, or as soon as it is re-sent or cancelled.',
  'email.invitation.howTo':
    'Open the link, then sign in or create your account, and you are in. The link works once.',
  'email.invitation.intro': 'You have been invited to help run {league} as {role}.',
  'email.invitation.linkFallback':
    'If the button does not work, copy this address into your browser:',
  'email.invitation.notExpected':
    'If you were not expecting this, you can ignore this email and nothing will happen.',
  // The invitation email (P4 §4, T-226), built by packages/emails. {league} is the
  // league's name, {role} a role's name from above, {days} how long a link works.
  'email.invitation.subject': 'You are invited to help run {league}',
  'email.newDevice.body': 'Your account was signed in on {device} at {when}.',
  'email.newDevice.notYou':
    'If this was not you, choose a new password and use "Sign out everywhere" on your account page:',
  'email.newDevice.subject': 'Your account was signed in on a new device',
  'email.passwordChanged.body':
    'The password of your account was changed at {when}, and every other device was signed out.',
  'email.passwordChanged.notYou':
    'If this was not you, choose a new password with "Forgot your password?" on the sign-in page:',
  'email.passwordChanged.subject': 'Your password was changed',
  'email.signInCode.code': 'Your code is {code}. It works for {minutes} minutes.',
  'email.signInCode.existing':
    'You already have an account with this address. Entering this code lets you choose a new password.',
  'email.signInCode.notExpected':
    'If you did not ask for this, you can ignore this email. Nobody can use the code without your mailbox.',
  'email.signInCode.subjectReset': 'Your code to choose a new password',
  // Sign-in emails (T-67, T-70, T-85), built by packages/emails. {code} is the 6-digit
  // code, {minutes} how long it works, {device} a device's name, {when} a time, {url}
  // an address of ours.
  'email.signInCode.subjectSignUp': 'Your code to create your account',
  'forgot.backToSignIn': 'Back to sign in',
  'forgot.intro':
    'Enter your email. If it has an account, we will send it a 6-digit code, and then you choose a new password.',
  'forgot.title': 'Choose a new password',
  'password.existing':
    'You already have an account. This changes its password and signs out your other devices.',
  'password.hide': 'Hide',
  'password.rules': 'At least 8 characters. Passwords that have leaked are refused.',
  'password.show': 'Show',
  'password.submit': 'Save and sign in',
  'password.title': 'Choose your password',
  'password.titleReset': 'Choose a new password',
  'problem.codeExpired': 'That code has run out. Ask for a new one.',
  'problem.codeNotSent': 'We could not send the email just now. Please try again in a minute.',
  'problem.codeUsedUp': 'Too many tries with this code. Ask for a new one.',
  'problem.codeWrong': 'That code is not right. Check the email and try again.',
  'problem.googleFailed': 'Signing in with Google did not work. Please try again.',
  'problem.invalidEmail': 'That does not look like an email address.',
  'problem.lockedOutMinutes_one':
    'Too many tries. Please wait {count} minute, or tap "Forgot your password?" to choose a new one now.',
  'problem.lockedOutMinutes_other':
    'Too many tries. Please wait {count} minutes, or tap "Forgot your password?" to choose a new one now.',
  'problem.lockedOut_one':
    'Too many tries. Please wait {count} second, or tap "Forgot your password?" to choose a new one now.',
  'problem.lockedOut_other':
    'Too many tries. Please wait {count} seconds, or tap "Forgot your password?" to choose a new one now.',
  'problem.noPassword': 'Your account has no password. Sign in with Google again instead.',
  'problem.passwordLeaked':
    'That password appears in lists of leaked passwords. Please choose another.',
  'problem.passwordTooLong': 'Your password is too long. Please choose a shorter one.',
  'problem.passwordTooShort': 'Your password needs at least 8 characters.',
  'problem.proofInvalid': 'That took too long. Ask for a new code.',
  'problem.signInAgain': 'Please sign in again.',
  'problem.signInToScore': 'Sign in to score this game.',
  'problem.signOutEverywhereFailed':
    'We could not sign out your other devices. This one is signed out: sign in and try again.',
  'problem.tooManyAttemptsMinutes_one': 'Too many tries. Please wait {count} minute and try again.',
  'problem.tooManyAttemptsMinutes_other':
    'Too many tries. Please wait {count} minutes and try again.',
  'problem.tooManyAttempts_one': 'Too many tries. Please wait {count} second and try again.',
  'problem.tooManyAttempts_other': 'Too many tries. Please wait {count} seconds and try again.',
  'problem.wrongEmailOrPassword': 'Wrong email or password.',
  'problem.wrongPassword': 'Wrong password.',
  'role.admin': 'Admin',
  'role.captain': 'Captain',
  'role.club_admin': 'Club admin',
  'role.coach': 'Coach',
  'role.editor': 'Editor',
  // The fixed roles (A-3, P4 §4), by the name the access module gives each.
  'role.owner': 'Owner',
  'role.registrar': 'Registrar',
  'role.scheduler': 'Scheduler',
  'role.scorekeeper': 'Scorekeeper',
  'signIn.already.account': 'Go to your account',
  'signIn.already.body': 'You are signed in as {email}.',
  'signIn.already.carryOn': 'Carry on',
  'signIn.already.switch': 'Sign out and use another account',
  'signIn.already.title': 'You are already signed in',
  'signIn.backTo': 'Back to {league}',
  'signIn.createAccount': 'New here? Create an account',
  // The sign-in screens (step 1.14, P6 §2 and §5). The same words whether or not an
  // account exists (T-68).
  'signIn.email': 'Email',
  'signIn.forgot': 'Forgot your password?',
  'signIn.fromLeague': 'Sign in to carry on at {league}.',
  'signIn.google': 'Continue with Google',
  'signIn.haveAccount': 'Already have an account? Sign in',
  'signIn.or': 'or',
  'signIn.password': 'Password',
  'signIn.submit': 'Sign in',
  'signUp.intro': 'Enter your email. We will send a 6-digit code to prove it is yours.',
  'signUp.sendCode': 'Email me a code',
  'signUp.title': 'Create your account',
} as const;
