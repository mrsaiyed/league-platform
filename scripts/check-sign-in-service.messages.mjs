// The words of scripts/check-sign-in-service.mjs (step 2.206): how to use it, why it
// refuses to run, the line for each check, and the checks only a person can make (T-187).
// No line here ever holds an address, a key, a token, a code or a password: the
// functions take only statuses, Supabase's error codes (already checked to be short
// identifiers), counts and times.

export const usage = [
  'Asks the real sign-in service every call our sign-in adapter makes, through the',
  'adapter’s own client, and says for each of record 018’s checks whether the answer was',
  'as our code expects (step 2.206). For the supervised session with the test copy only.',
  '',
  'node scripts/check-sign-in-service.mjs --hosted',
  '',
  'At a terminal only, with SUPABASE_URL (exactly https://<project reference>.supabase.co)',
  'and SUPABASE_SECRET_KEY (its secret key) in the environment for this one command.',
  'Without --hosted it takes only a stand-in on this computer (http://127.0.0.1:<port>). It',
  'refuses the tracker’s project, like the website. It makes one made-up user, with an',
  'address ending .test, and removes it at the end, even when a check differs or Ctrl+C',
  'stops it. It prints no address, key, token, code or password.',
  '',
  'How to run it, and what to do with its answer: docs/operations/check-sign-in-service.md',
];

export const hostedNeeded =
  'It asks a real sign-in service, so it runs only when told so with --hosted.';
export const needsTerminal =
  'It runs only at a terminal, with a person watching, never under CI: nothing was asked, nothing was made.';
export const settingMissing = (name) => `${name} is not set for this command.`;
export const keyTooShort = 'SUPABASE_SECRET_KEY is too short to be a secret key.';
export const hostedAddressForm =
  'With --hosted, SUPABASE_URL must be exactly https://<the project’s 20-character reference>.supabase.co: no other host, and nothing after it (no path, port, login or query).';
export const nothingAsked = 'Nothing was asked of any service.';

export const title = 'The sign-in service check (step 2.206, record 018)';
export const whereHosted = 'Where: a hosted sign-in service, over https.';
export const whereLocal = 'Where: a sign-in service on this computer, over plain http.';
export const aboutTheRun = [
  'Nothing printed here names the service, nor any key, token, code, password or address.',
  'It makes one made-up user (an address ending .test), asks every call the adapter makes',
  'and removes the user at the end. It takes about two minutes. Ctrl+C stops it and still',
  'removes the user.',
];

export const groups = {
  settings: 'The project’s settings',
  codes: 'Sign-up codes',
  passwords: 'Passwords',
  sessions: 'Sessions',
  reset: 'Resetting a password',
  timing: 'Timing (T-68)',
  everyRequest: 'Every signed-in request (M10)',
  cleanUp: 'Clean-up',
};

/** Each check's line, in the order they run; the record 018 item it answers in brackets. */
export const checks = {
  settingsKey: 'The project’s settings answer with the secret key (018 #11)',
  confirmEmail: '“Confirm email” reads as on (018 #12)',
  signUpsOn: '“Allow new sign-ups” reads as on (018 #9)',
  providers: 'Email and Google are the only ways to sign in (018’s settings)',
  signUpCode: 'A sign-up code for a new .test address is made, in the shape we read (018 #1)',
  signUpType: 'That code is to be checked as signup (018 #3)',
  codeLength: 'The code is 6 digits (018’s settings)',
  codeAgain: 'A second code for the same address at once is not held back (018 #2)',
  wrongCode: 'A wrong code is refused as otp_expired (018 #1)',
  noCodeSent: 'A check where no code was sent is refused as otp_expired (018 #1)',
  rightCode: 'The right code, after a wrong one, gives a session in the shape we read (018 #1)',
  confirmedCode:
    'A code for that address, now confirmed, is to be checked as magiclink and gives a session (018 #3)',
  tokenLife:
    'An access token lasts 3600 seconds, five minutes allowed for this computer’s clock (018’s settings)',
  user: 'The user call answers the session’s user, its address confirmed (018 #1)',
  madeUpToken: 'A made-up access token is refused as bad_jwt (018 #1)',
  shortPassword: 'A 7-character password is refused as weak_password, length (018 #1)',
  eightLetters:
    'A password of 8 lower-case letters is taken: 8 at least, no rules (018’s settings)',
  samePassword: 'The same password again is refused as same_password (018 #1)',
  leakedPassword:
    'A leaked password is refused as weak_password, pwned, where that paid protection is on (018 #10)',
  newPassword: 'A new password is taken (018 #1)',
  passwordSignIn: 'Signing in with the password gives a session in the shape we read (018 #1)',
  wrongPassword: 'A wrong password is refused as invalid_credentials (018 #1)',
  noAccount: 'An address with no user is refused as invalid_credentials (018 #1)',
  longPassword: 'A password over 72 bytes is taken, not refused (018 #5)',
  passwordEndsOthers: 'A password change ends the user’s other sessions, not its own (018 #7)',
  longPasswordCut: 'That password is cut at 72 bytes, so our own refusal matters (018 #5)',
  logoutOthers: 'Ending the other sessions ends them and keeps this one (018 #7)',
  logoutLocal: 'Ending one session ends it (018 #1)',
  refresh: 'Renewing a session gives new tokens in the shape we read (018 #1)',
  madeUpRefresh: 'A made-up refresh token is refused as refresh_token_not_found (018 #1)',
  refreshReuse:
    'A refresh token used again at once is refused as refresh_token_already_used (018 #6)',
  logoutGlobal: 'Ending every session ends them all (018 #1)',
  madeUpGoogle: 'A made-up return from Google is refused as flow_state_not_found (018 #1)',
  resetNoUser: 'A reset code for an address with no user is refused (018 #1)',
  resetByCode: 'A reset by code changes the password (018 #9)',
  passwordTiming: 'A wrong password answers well inside our 750 ms floor, user or not (018 #8)',
  resetTiming: 'Reset requests answer as expected, user or not; their times are below (018 #8)',
  userBurst: '300 user calls in a minute on one session: none refused (M10)',
  removed: 'The made-up user is removed, and its address is free again',
};

export const asExpected = 'as expected';
export const differed = 'DIFFERED';
/** A line that says how the project is set, where either way is one we expect: not a difference. */
export const noted = 'NOTED';
export const leakedOff =
  'leaked-password protection is OFF on this project (a paid setting; the founder’s call, 018 #10)';
export const someNoted = (count) =>
  `${count} ${count === 1 ? 'line' : 'lines'} NOTED above: not a difference, a setting for the founder to decide.`;
export const line = (verdict, label, detail) =>
  detail === undefined
    ? `  ${verdict.padEnd(12)}${label}`
    : `  ${verdict.padEnd(12)}${label}: ${detail}`;

// What differed, in a few words: the call, the status and Supabase's error code.
const codePart = (code) => (code === undefined ? ', no error code' : `, error code ${code}`);
export const refusedWith = (call, status, code) =>
  `${call} was refused with status ${status}${codePart(code)}`;
export const acceptedInstead = (call) => `${call} was accepted where a refusal was expected`;
export const answeredRedirect = (call, status) =>
  `${call} answered status ${status}, a redirect (never followed)`;
export const answeredFailure = (call, status, code) =>
  `${call} answered status ${status}${codePart(code)}`;
export const answeredShape = (call) => `${call} answered in a shape our code does not read`;
export const noConnection = (call) => `${call} could not reach the service`;
export const cutOff = (call) => `${call}: the answer was cut off`;
export const noAnswerInTime = (call) => `${call}: no answer within 10 seconds`;
export const ourOwnFault = (call) => `${call}: the check itself failed, not the service`;
export const otherCode = 'another error code';
export const wrongVerifyType = (type) => `generate_link answered verification_type ${type}`;
export const codeNotSixDigits = 'generate_link answered a code that is not 6 digits';
export const tokenLifeWas = (seconds) =>
  `verify answered an access token lasting ${seconds} s by this computer’s clock, more than five minutes off 3600`;
export const otherUser = 'user answered another user than the session’s';
export const notConfirmed = 'user answered the address as not confirmed';
export const otherSession = 'refresh answered a token of another session';
export const autoconfirmOff = 'settings answered mailer_autoconfirm true: “Confirm email” is off';
export const confirmationUnknown = (kind, status) =>
  `settings could not be read as on or off (${kind}${status === undefined ? '' : `, status ${status}`})`;
export const signUpsOff = 'settings answered disable_signup other than false';
export const providersDiffer = (names) =>
  `settings answered other ways to sign in, or not these: ${names.join(', ')}`;
export const settingsShape = 'settings answered in a shape our code does not read';
export const slowerThanFloor = (slowest, limit) =>
  `the slowest try took ${slowest} ms, over the ${limit} ms that leaves our floor room`;
export const refusedCalls = (count, total, detail) =>
  `${count} of ${total} were not answered as expected; the first: ${detail}`;
export const stillThere = 'generate_link still found the user after it was removed';
export const notChecked = 'not checked: a line above that it needs differed';
export const stoppedHere = 'not checked: stopped with Ctrl+C';

export const measuredTitle =
  'Measured, for the lead to judge (018 #8, M10; nothing here fails the run)';
export const times = (what, { middle, slowest, count }) =>
  `  ${what}: middle ${middle} ms, slowest ${slowest} ms (${count} ${count === 1 ? 'call' : 'calls'})`;
export const timedWrongWithUser = 'A wrong password, address with a user';
export const timedWrongWithout = 'A wrong password, address with none';
export const timedResetWithUser = 'A reset request, address with a user';
export const timedResetWithout = 'A reset request, address with none';
export const timedUserCall = 'A user call';
export const floorIs = (floor) => `  Our password floor (passwordMinMilliseconds): ${floor} ms`;
export const notMeasured = '  Nothing could be measured.';

export const allAsExpected = (count) => `All ${count} checks were as expected.`;
export const someDiffered = (count, total) =>
  `${count} of ${total} checks were not as expected. Stop the session here and give the lead these lines (docs/operations/check-sign-in-service.md).`;
export const notRemoved = [
  'THE MADE-UP USER MAY NOT HAVE BEEN REMOVED. In the Supabase dashboard, Authentication,',
  'Users: remove the user made today whose address starts with check-sign-in- and ends .test.',
];
export const stoppedTwice = [
  'Stopped at once, at the second Ctrl+C: the made-up user may not have been removed.',
  ...notRemoved,
];
export const stopping = 'Stopping after the check in hand; the made-up user is removed next.';
export const unexpected =
  'The check stopped on a fault of its own; nothing it printed names the service.';

export const personTitle = 'Only a person can check these (record 018), in the Supabase dashboard:';
export const personChecks = [
  '  - Authentication, Sign In / Providers, Email: “Confirm email” is there and on (018 #13).',
  '    Switch it off and run this check again: its “Confirm email” line must differ. Then',
  '    switch it back on (018 #12).',
  '  - “Allow new sign-ups” on and “Secure password change” off (018 #9).',
  '  - Refresh-token rotation on, its reuse interval 0, no session time-box or inactivity',
  '    limit (018 #6, 018’s settings).',
  '  - The limits per network (Authentication, Rate Limits) far above ours: every call comes',
  '    from our server, so they are shared by all our users (018 #4).',
  '  - Leaked-password protection: on the project’s plan? It costs money, so it is the',
  '    founder’s call (018 #10).',
  '  - The logs show no email sent by this run: codes are made, never sent (018 #2).',
  '  - Email code expiry 600 seconds; Google the only other provider, the redirect allow-list',
  '    holding only our own origins; Supabase’s own emails unused (018’s settings).',
  '  - On a phone: sign in with Google, end to end; a script cannot be Google (018 #1).',
  '  - The times above, with the lead: the floor sits well above the slower password try,',
  '    and the two reset times differ by no more than noise (018 #8).',
];
