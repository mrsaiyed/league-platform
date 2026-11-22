# Restoring the database

> **Not yet followed, and not yet whole.** The full restore procedure is step 2.210's (audit 2.110 moved it there). This page says what is true for the first test copy until then. It counts as written only once it has been followed in the supervised session the founder starts with the lead beside them (T8 §11, T-165).

## The test copy

The test copy holds **made-up data only**. If its database is lost or spoiled, nothing real is lost, so it is not restored from a backup: it is made again.

1. Stop the website on Render (Settings, **Suspend**), so nothing writes to a half-made database.
2. Follow [setting up a new test copy](new-test-copy.md) from step 3 on a new (or emptied) project: the release command applies every change; `app_login` is made again with a new password (step 4) and given the sign-in store (step 5).
3. Make the made-up league again with [make a league](make-a-league.md).
4. Change `PLATFORM_DATABASE_URL` on Render to the new address, resume the service, and deploy the commit in `STATUS.md`.
5. The first check: save one form and see the page it leads to (step 2.239).

**Never** use a backup of the Al-Hadi tracker's project, or of any real people's data, to fill a test copy (T-201).

## Going back is not restoring

Going back to the previous version of the website ([releasing and going back](releasing-and-going-back.md), section 4) never changes the database. Do not restore a database to undo a release.

## Left for step 2.210

What Supabase's plan keeps as backups and for how long, how a restore is asked for and checked, and the drill that proves it, before real people's data exists.
