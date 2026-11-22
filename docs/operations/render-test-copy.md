# The test copy on Render: the checklist

> **Not yet followed.** This checklist counts as written only once it has been followed in the supervised session the founder starts with the lead beside them (T8 §11, T-165; audit 2.110, section 10, step 9). Until then every Render setting below is **not verified**, and each one marked "to confirm" is the lead's best reading of Render's and Supabase's own pages, to be checked on the screen that day.

The Render services are written down as this checklist, not as a blueprint file (`render.yaml`): see T-300 for why. In short, a blueprint lets a file in the repository create and change services on Render, and here every setting is typed by the founder and checked by eye, one by one.

## What runs where

| What                            | Test copy (now)                                       | Production (later, before real people)                                                       |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The website                     | One Render **web service**, free instance             | The same, on a paid instance                                                                 |
| The worker (emails later, jobs) | **None**: the walk does not need it                   | A Render **background worker** from the same image, with its own login holding `queue_owner` |
| Cloudflare in front             | **None** (T-270): Render's own `onrender.com` address | Cloudflare in front of the league addresses, `TRUSTED_PROXY=cloudflare`                      |
| The database                    | The test copy's own Supabase project                  | Production's own Supabase project, never the tracker's                                       |

All of them are built from **one image**, `platform.Dockerfile` at the top of the repository (never `./Dockerfile`, which is the Al-Hadi tracker's).

## Before you start (the founder)

- A Render account in your own name, with **two-step sign-in** on.
- **No Render API key** is made for this, and none is ever put in `.env.staging` or given to an AI session (audit 2.110, M7). If one is made for the day, delete it before leaving.
- Render connected to the GitHub repository (Render asks for access to it; give it this repository only).

## The website's service: every setting

Create a **Web Service** from the GitHub repository and set, one by one:

| Setting in Render    | Value                                                                                | Where it comes from                                          |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Name                 | for example `srleagues-test-copy`                                                    | your choice; it becomes the `….onrender.com` address         |
| Language / Runtime   | **Docker**                                                                           | fixed                                                        |
| Branch               | `build/stage-1` (the build branch named in `STATUS.md`)                              | `STATUS.md`                                                  |
| Dockerfile path      | `./platform.Dockerfile`                                                              | fixed                                                        |
| Docker build context | `.` (the top of the repository)                                                      | fixed                                                        |
| Docker command       | leave empty: the image starts the website by itself                                  | fixed                                                        |
| Instance type        | **Free**                                                                             | fixed for the test copy                                      |
| Health check path    | `/api/v1/health`                                                                     | fixed                                                        |
| **Auto-Deploy**      | **Off** (Render may call it "No" or "Off"; to confirm)                               | fixed: every deploy is by hand, from a commit in `STATUS.md` |
| Pre-deploy command   | leave empty (paid instances only; the release command runs at your terminal instead) | fixed                                                        |

Then its **Environment** settings. You type each value yourself; nothing else goes in:

| Setting                 | Value                                                                                                                                                                                  | Where the value comes from                                                                                                                                                                                                                       | Secret? |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `APP_ENV`               | `staging`                                                                                                                                                                              | fixed                                                                                                                                                                                                                                            | no      |
| `PUBLIC_BASE_URL`       | the service's own address, `https://<name>.onrender.com`                                                                                                                               | the top of the service's page in Render                                                                                                                                                                                                          | no      |
| `EMAIL_FROM`            | a made-up sender, for example `test-copy@example.test`                                                                                                                                 | your choice, made up                                                                                                                                                                                                                             | no      |
| `TRUSTED_PROXY`         | `one`                                                                                                                                                                                  | fixed for now; proved by the session's step 18, and look first at how Render shows a visitor's address (record 081, check 4)                                                                                                                     | no      |
| `PLATFORM_DATABASE_URL` | `postgresql://app_login.<reference>:<password>@<pooler host>:5432/postgres`: `app_login` on the **Session pooler**, port 5432 (to confirm), not the direct address and never port 6543 | Supabase dashboard, Connect, Session pooler: it shows the user as `postgres.<reference>`; put `app_login` in place of `postgres` and `app_login`'s password from your password manager after the `:` ([new test copy](new-test-copy.md), step 7) | **yes** |
| `PLATFORM_DATABASE_CA`  | the text of the test copy's database certificate, from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`                                                                    | the file you downloaded from Supabase (Database settings, SSL), pasted whole (step 2.203)                                                                                                                                                        | no      |
| `SUPABASE_URL`          | the test copy's project address, `https://<reference>.supabase.co`                                                                                                                     | Supabase dashboard, the project's settings                                                                                                                                                                                                       | no      |
| `SUPABASE_SECRET_KEY`   | the test copy's secret key                                                                                                                                                             | Supabase dashboard, API keys                                                                                                                                                                                                                     | **yes** |
| `LOG_LEVEL`             | `info`                                                                                                                                                                                 | fixed                                                                                                                                                                                                                                            | no      |

**Never** set any of these on Render: `MIGRATION_DATABASE_URL` (the migration login: it owns the tables and sees past the league fence; it is typed at your terminal for one release only), `DATABASE_URL` (the tracker's), `RESEND_API_KEY`, any Stripe key, any `TURNSTILE_` key unless the bot check is being tried, anything starting `LOCAL_`. Check the list matches, one by one, before the first deploy.

**The bot check's keys (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) are not needed for the first sitting.** In staging the website starts without them (only production refuses to start without them; one without the other is refused). Its log then says: "The bot check is off: TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are not set, so sign-in and sign-up are not checked for bots". What is weaker without them: anyone who finds the `onrender.com` address could try sign-ups and passwords by machine, held back only by the lock on each address after wrong passwords; the copy holds only made-up data, and its pages say "do not index". Getting the keys is a sign-up with Cloudflare, which is the founder's to do; until then, leave both out.

**The pooler and its connections.** The website opens up to **ten** connections to the database (its pool, `maxConnections` 10 in `packages/database`). Supabase's direct address answers over IPv6 only on the free plan, which Render may not reach, so the website uses the Session pooler (to confirm). In the Supabase dashboard, check the pooler's pool size is at least ten plus a few spare for the release command and the SQL editor (to confirm the free plan's number on the day).

## Deploying

Deploy only by hand: **Manual Deploy**, **Deploy a specific commit**, the commit the release command named ([releasing and going back](releasing-and-going-back.md)). Never "Deploy latest commit" without checking it is the one in `STATUS.md`.

The free instance sleeps after a while with no visitors (Render says about 15 minutes; to confirm). The first visit after that takes up to a minute or so. That is not a fault.

## What the supervised session must prove (not verified until then)

- The free instance builds an image from `platform.Dockerfile` (audit 2.110, M20).
- Render reads `platform.Dockerfile.dockerignore`, so no `.env` file reaches the image.
- Auto-Deploy off: a push to the branch does not start a deploy.
- The settings list matches, one by one, and the website starts with them (steps 9 and 10).
- How Render passes on a visitor's address, and that `TRUSTED_PROXY=one` is right for it (step 18).
