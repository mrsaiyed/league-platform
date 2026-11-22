# Setting up a new test copy

> **Not yet followed.** This procedure counts as written only once it has been followed in the supervised session the founder starts with the lead beside them (T8 §11, T-165; it is the audit 2.110's section 10, steps 3 to 13, as the lead corrected it). Until then it is **not verified**. When it has been followed, the lead writes "Followed on (date)" here.

A **test copy** is the whole platform online with made-up data only: its own Supabase project (database and sign-in), and the website on Render. Never the Al-Hadi tracker's project, the one named in `supabase/site.json`.

**Who does what.** The founder, at their own computer, types every address, password and key, in the Supabase and Render dashboards and at their terminal. The lead reads the screen with them and never holds a password. If what you see at a step is not what it says here, stop there and do not go on.

The order matters: steps 1 to 6 are all done **before the website is started** (step 7).

## 1. Check it is the right project

In the Supabase dashboard, open the test copy's project and read its **reference** aloud (the short code in its address). Then read the one in `supabase/site.json`. **They must be different.** If they are the same, stop: that is the tracker's live project.

## 2. Turn "Confirm email" on

In the test copy's dashboard: **Authentication**, then **Sign In / Providers**, then **Email**: "Confirm email" **on**. See the switch on.

Without it, the first person to sign up with an owner's address would take that league. The website checks this itself and refuses to start while it is off (step 2.115), and says what to turn on and where.

## 3. Apply the database changes

At your terminal, run the release command against the new copy, as the tables' owner, the certificate checked: section 1 of [releasing and going back](releasing-and-going-back.md). The address you type has no password in it; paste the owner's password from your vault when the command asks (nothing shows while you do). See every change listed as applied, up to the newest. Run it again: nothing applied.

This makes the tables and the two roles the website needs, `app_user` and `sign_in_store`. Neither can sign in by itself.

## 4. Make the website's own login, `app_login`

The website never signs in as the tables' owner. It has its own login, which can only do what `app_user` may do, inside one league at a time.

1. Make a new, long, random password in your password manager, and save it there under "test copy: app_login".
2. In the dashboard's **SQL editor**, run, with that password in place of the dots:

   ```sql
   create role app_login login password '…';
   grant app_user to app_login;
   ```

   See "Success". Clear the editor afterwards so the password is not left on the screen.

## 5. Give it the sign-in store, once

Still in the SQL editor, run once:

```sql
grant sign_in_store to app_login;
```

See "Success" (or that it is already granted). The website refuses to start until its login has this (record 055).

## 6. The checks on the real database

The lead and you run the checks on real PostgreSQL from step 2.93's line together (or by hand, as the lead reads them out). Every one must answer as its line says; any other answer stops the session.

## 7. Start the website on Render

Follow [the test copy on Render](render-test-copy.md): one web service, the free instance, automatic deploys off, every setting typed by you and checked against its list one by one. `PLATFORM_DATABASE_URL` is `app_login`'s address on the Session pooler (to confirm), with the password from step 4. Then deploy the commit the release command named, and read the log together: section 2 of [releasing and going back](releasing-and-going-back.md).

## 8. The first checks on the copy

1. **Save one form** (step 2.239). This is the first check, before anything else: once a league and its owner exist ([make a league](make-a-league.md)), sign in as the owner, change one thing in a form, save, and see the page it leads to, with the change. Until a league exists, the health address is the only check: `https://<name>.onrender.com/api/v1/health` answers `"status":"ok"` with its database check.
2. **From a phone, signed out:** any page shows the test-copy notice; the page's headers say `noindex`, and so does `/robots.txt`.
3. **From a phone:** `/signin/kept-emails`, `/signin/made-up-people` and `/signin/no-such-page` give the same "not found" page.
4. **From a phone:** signing up with a real-looking address that is not made up is refused in plain words.
5. **Two phones, two addresses.** Wrong passwords typed for an address lock that **address** for 15 minutes on every network. So, to see that one visitor's wrong guesses do not lock out everyone, phone A types wrong passwords for one made-up address, and phone B, on mobile data, signs in with a **different** made-up address. Phone B must be let in; if not, `TRUSTED_PROXY` is wrong for Render: stop.

## Where each password lives, and how it is changed

| Login or key                                            | Where it lives                                                                                                                                               | Never                                                     | How it is changed                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------- |
| The tables' owner (`postgres`), the **migration login** | Your password manager; typed at your terminal for one release only. It may also sit in your git-ignored `.env.staging` for a session you start with the lead | In `.env`, in Render, in a chat, in the repository        | [Rotating a secret](rotating-a-secret.md), "The tables' owner"   |
| `app_login`, the **website's login**                    | Your password manager, and Render's `PLATFORM_DATABASE_URL` setting                                                                                          | In a chat, in the repository                              | [Rotating a secret](rotating-a-secret.md), "The website's login" |
| The sign-in service's **secret key**                    | Supabase's dashboard (API keys), and Render's `SUPABASE_SECRET_KEY` setting                                                                                  | In a chat, in the repository                              | [Rotating a secret](rotating-a-secret.md), "The sign-in key"     |
| The worker's login (later), `worker_login`              | Your password manager, and the worker's own Render setting                                                                                                   | Shared with the website                                   | As `app_login`                                                   |
| Render and Supabase accounts                            | Your password manager, with two-step sign-in                                                                                                                 | Shared, or given to an AI session; no Render API key kept | In each service's account settings                               |

## Later: the worker's own login

The first test copy runs **without the worker**. When the worker is added (step 2.112 makes its queue), it gets a login of its own, made the same way as step 4 and given the queue's role as well:

```sql
create role worker_login login password '…';
grant app_user, queue_owner to worker_login;
```

The website refuses to start with a login that holds `queue_owner`, so the two are never the same login.

## What the supervised session must prove (not verified until then)

Each step above, in order, as it says; in particular that the website refuses to start while "Confirm email" is off or before step 5, and starts after both.
