# Restoring the database

> **Not yet followed, and not yet whole.** The full restore procedure is step 2.210's (audit 2.110 moved it there). This page says what is true for the first test copy until then. It counts as written only once it has been followed in the supervised session the founder starts with the lead beside them (T8 §11, T-165).

## The test copy

The test copy holds **made-up data only**. If its database is lost or spoiled, nothing real is lost, so it is not restored from a backup: it is made again.

Follow these steps from the first one, in order. If what you see at a step is not what it says here, stop there.

1. **Stop the website.** In Render, the test copy's web service, Settings, **Suspend** (to confirm the button's name), so nothing writes to a half-made database.
2. **Make a new Supabase project** for the test copy, in your Supabase account. Always a new one: the spoiled project is never emptied by hand, because removing its tables and roles one by one can leave something half-removed. If the free plan's limit on projects stops you, delete the spoiled project first (step 9 says how), then make the new one (to confirm the limit on the day).
3. **Set it up from the very first step** of [setting up a new test copy](new-test-copy.md): step 1 (read the **new** project's reference aloud; it must not be the one in `supabase/site.json`), step 2 ("Confirm email" on), step 3 (the release command applies every change; download the **new** project's certificate first, as `staging-ca.crt`, and use the new reference in the address), steps 4 and 5 (`app_login` again, with a **new** password, and the sign-in store), and step 6 (the checks).
4. **Make the made-up league again** with [make a league](make-a-league.md).
5. **Change four settings on Render** (the web service, **Environment**), because each one names the old project. Check each against [the test copy on Render](render-test-copy.md)'s list:
   - `PLATFORM_DATABASE_URL`: `app_login`'s address on the new project's Session pooler, with the new reference in its user name and the new password ([new test copy](new-test-copy.md), step 7);
   - `PLATFORM_DATABASE_CA`: the text of the new project's certificate;
   - `SUPABASE_URL`: `https://<new reference>.supabase.co`;
   - `SUPABASE_SECRET_KEY`: the new project's secret key (Supabase dashboard, API keys).
6. **Resume the service** and deploy the commit in `STATUS.md` by hand; read the log together ([releasing and going back](releasing-and-going-back.md), section 2).
7. **The first check:** save one form and see the page it leads to (step 2.239).
8. **Change your vault:** the new project's owner password and `app_login`'s new password replace the old ones there.
9. **Delete the spoiled project** (if step 2 did not already): in the Supabase dashboard, open it, read its reference aloud and check it is the **old test copy's**, not the new one's and not the one in `supabase/site.json`; then its General settings, **Delete project** (to confirm the button's name). Never delete a project whose reference you have not read.

**Never** use a backup of the Al-Hadi tracker's project, or of any real people's data, to fill a test copy (T-201).

## Going back is not restoring

Going back to the previous version of the website ([releasing and going back](releasing-and-going-back.md), section 4) never changes the database. Do not restore a database to undo a release.

## Left for step 2.210

What Supabase's plan keeps as backups and for how long, how a restore is asked for and checked, and the drill that proves it, before real people's data exists.
