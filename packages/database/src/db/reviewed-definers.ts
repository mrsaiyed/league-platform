// T-469: the SECURITY DEFINER functions the app's login may run, each with the reason it
// was reviewed and let through. Such a function runs as its owner, which sees past the
// league fence, so it is the one way a login fenced to one league could read another's
// rows. The start-up guard (check-fence.ts) refuses any other in a schema the login, or a
// role it may become, may use, of any return type and whoever may run it (T-499: PostgreSQL
// checks the right to run an aggregate's transition function, an operator's or a cast's
// against another role than the caller); the isolation check (isolation-coverage.test.ts)
// proves this list is exactly the security-definer functions the migrations make in a
// schema app_user may use, so adding a line here is a review. Each reason was written from
// the function's body as the migrations leave it. Trigger functions are here too since
// T-499: no one can call them, but the rule no longer asks who may.

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
    'public.change_own_email(given_email text)',
    'moves the address of the account the transaction set, after a confirmed change of email (T-73, T-458): refuses an .invalid address, takes the address’s lock, returns taken when another account holds it (by lower()), else sets that one account’s email and returns changed; reads no league table (0032)',
  ],
  [
    'public.check_league_has_default_program()',
    'trigger function only, run on a write to leagues or programs: refuses to end a transaction in which a league that still exists has no default program; reads only that league’s own leagues and programs rows, returns nothing (0003, 0005)',
  ],
  [
    'public.check_league_slug_free()',
    'trigger function only, run on a write to leagues: refuses a short name that still forwards to another league; reads only league_slug_history’s short names and league ids, returns the row it was given (0003, 0005)',
  ],
  [
    'public.check_old_slug_free()',
    'trigger function only, run on a write to league_slug_history: refuses a former short name another league holds or forwards; reads only short names and league ids, returns the row it was given (0003, 0005)',
  ],
  [
    'public.create_own_profile(given_first_name text, given_last_name text, given_birth_date date)',
    'makes the own profile of the account the transaction set, once: that account’s personal rows only; reads no league table (0012)',
  ],
  [
    'public.email_free_for_own_account(given_email text)',
    'whether no account but the one the transaction set holds an address (T-458), by lower() under the address’s lock: a yes or a no, never whose; reads accounts only, no league table (0032)',
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
