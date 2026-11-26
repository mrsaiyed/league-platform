// T-469: the SECURITY DEFINER functions the app's login may run, each with the reason it
// was reviewed and let through. Such a function runs as its owner, which sees past the
// league fence, so it is the one way a login fenced to one league could read another's
// rows. The start-up guard (check-fence.ts) refuses any other the login, or a role it may
// become, can run; the isolation check (isolation-coverage.test.ts) proves this list is
// exactly what the migrations let app_user run, so adding a line here is a review.
// Each reason was written from the function's body as the migrations leave it.
//
// Trigger functions are not here: no one can call them, they run only on a write to their
// table, which the fence already holds.

/** `schema.name(arguments)` as the catalog states it, and the reviewed reason. */
export const reviewedDefiners: ReadonlyMap<string, string> = new Map([
  [
    'public.access_list_names()',
    'names on the access list of the league the transaction set (current_league_id): the id and display name of each account holding a grant there, and its owner; no league set, no rows (0012, record 008)',
  ],
  [
    'public.account_for_sign_in(given_sign_in_id text, given_email text)',
    'the account for a sign-in the sign-in store has just proved: finds it by sign-in id, else links the unlinked account with that email, else makes one; returns an id only and reads no league table (0012, record 052); it trusts its caller to have proved the email',
  ],
  [
    'public.account_of_sign_in(wanted text)',
    'the account one sign-in id belongs to: its id only, from accounts; reads no league table (0012, record 052)',
  ],
  [
    'public.create_own_profile(given_first_name text, given_last_name text, given_birth_date date)',
    'makes the own profile of the account the transaction set, once: that account’s personal rows only; reads no league table (0012)',
  ],
  [
    'public.erase_account()',
    'erases the account the transaction set (T-52): refuses while it owns a league or its profile is in one; ends that account’s grants, removes its game assignments and scoring sessions, empties its accepted invitations’ email, in every league, and nothing of anyone else’s (0012)',
  ],
  [
    'public.find_league_by_slug(wanted text)',
    'the league one short name in an address names, before any league is set (T-221): id, short name, state, in the bin, forwarded; one value at a time (0005)',
  ],
  [
    'public.keep_email(given_to text, given_kind text, given_subject text, given_text text)',
    'the test copy’s kept emails (record 098): adds one email to a made-up address to kept_emails.emails and trims the oldest; no league column, returns nothing (0023)',
  ],
  [
    'public.my_leagues()',
    'the leagues of the account the transaction set (record 066): their id, short name, name, state and that account’s own roles and roster place; nothing for no account (0018)',
  ],
  [
    'public.take_jobs(how_many integer, lease_seconds integer)',
    'the worker taking due jobs of every league (record 012): refused in a transaction with a league or account set; returns each job’s id, league, type, ids and lease, no other league data (0006)',
  ],
]);
