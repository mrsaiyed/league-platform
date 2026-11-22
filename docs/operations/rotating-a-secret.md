# Changing a password or key (rotating a secret)

> **Not yet followed.** This procedure counts as written only once it has been followed in the supervised session the founder starts with the lead beside them (T8 §11, T-165). Until then it is **not verified**. When a part has been followed, the lead writes "Followed on (date)" beside it.

Change a password or key when it may have been seen by someone who should not have it (pasted into a chat, shown on a shared screen, left in a file), when someone who knew it leaves, or as a habit. **The founder types every new value**; the lead reads the screen and never holds it. Each new value is made in the password manager first.

The test copy holds made-up data only, so a few minutes of the website refusing to start while a value is changed is harmless. Do not change one while a game is being scored.

## The tables' owner (the migration login)

This is the strongest login: it owns every table and sees every league. It is never a setting on Render, so changing it touches nothing that is running.

1. Supabase dashboard, the test copy's project, **Database settings**: **Reset database password**. Paste the new one from your password manager.
2. Update it wherever you keep it for the release command (your password manager; your git-ignored `.env.staging`, if you keep it there).
3. Check: run the release command once ([releasing and going back](releasing-and-going-back.md), section 1) and see "Already applied" with nothing new. The old password must be refused.

The owner's password once pasted into a chat is still to be changed this way (`STATUS.md`, "Needs the founder").

## The website's login (`app_login`)

1. Make a new password in your password manager.
2. In the dashboard's **SQL editor**: `alter role app_login password '…';` with the new one. See "Success" and clear the editor. From now on the running website cannot open new connections until step 3.
3. In Render, the web service, **Environment**: change the password inside `PLATFORM_DATABASE_URL`, save, and deploy the **same** commit that is running (Manual Deploy, the commit shown in Events).
4. Check: the log shows no refusal, and the health address answers `"status":"ok"` with its database check.

## The sign-in key (`SUPABASE_SECRET_KEY`)

1. Supabase dashboard, **API keys**: make a new secret key (to confirm the button's name on the day).
2. In Render, change `SUPABASE_SECRET_KEY` to the new key, save, and deploy the same commit that is running.
3. Check: the health answer is `"ok"`; signing in on a phone works.
4. Only then, in Supabase, delete the old key.

## The worker's login (later)

As the website's login, with `worker_login` and the worker's own service.

## A Render API key

None is kept (audit 2.110, M7). If one was made for a session, delete it in Render's account settings before leaving.

## What the supervised session must prove (not verified until then)

At least one change of the website's login, followed from step 1 to its check: the old password refused, the new one working, the website back to `"ok"`.
