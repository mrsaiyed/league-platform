# Check the sign-in service

This page is for the supervised session with the test copy ("staging"), where the founder and the lead sit together. The tool is `node scripts/check-sign-in-service.mjs --hosted` (step 2.206). **Run it as the session's first act**, before the website is started and before anyone signs up: until it has run, the sign-in adapter has only ever answered a fake written by hand ([record 018](../architecture/decisions/018-the-supabase-sign-in-adapter.md)), and the first real answer would otherwise be met when the owner signs up on a phone.

**It has not yet been run against a real service.** Everything it does is tested against that same fake, answering over HTTP on this computer only (T-201, `tests/check-sign-in-service.test.mjs`). No builder and no unattended run ever runs it against a real service: it refuses to run anywhere but at a terminal, and the rule is what stops an AI session whose tool gives it one.

## What it does

Through the adapter's own client (`packages/providers/src/sign-in/supabase/gotrue-client.ts`), it asks every call the adapter makes, and prints one line for each of record 018's checks that a script can make: **"as expected"**, or **"DIFFERED"** with the call, the status and Supabase's error code that differed. "As expected" means what the adapter relies on, which is also what the fake answers.

- **One made-up user.** It makes one user with a made-up address ending `.test`, and removes it at the end, even when a check differs or Ctrl+C stops it. The last check says it was removed. If it could not be, the tool says so in capitals and what to remove by hand in the dashboard.
- **Nothing secret on the screen.** It never prints an address, a key, a token, a code or a password, in any line or error. Its lines can be read aloud, copied into the chat and kept in the stage report.
- **The tracker's project is refused**, by the website's own guard (record 055), before anything connects: an address naming it in any spelling, or the same address as `DATABASE_URL`. So is any `SUPABASE_URL` that is not exactly `https://<reference>.supabase.co`: another host, a look-alike, a port, a path or anything else after it. Without `--hosted` it takes only the stand-in on this computer (`http://127.0.0.1:<port>`), which its tests use.
- **Every signed-in request asks the service once** (audit M10), so it also sends 300 `user` calls in a minute on one session and says whether any was refused.
- **About two minutes**, one of which is those 300 calls. It sends about 20 password sign-ins in all, under Supabase's own limit of 30 per network in 5 minutes even before that limit is raised.
- **Timing (T-68).** It times 5 wrong passwords for the made-up user and 5 for an address with no user, and 5 reset requests each way, and prints the times in a block of their own. The password line differs if the slowest try comes within 250 ms of our floor (`passwordMinMilliseconds`, 750 ms). The reset times are for the lead to judge: record 018 says to pad a reset too if the two differ by more than noise.
- **The checks only a person can make** are listed last: the dashboard's switches, the limits per network, leaked-password protection (the founder's call, as it costs money), Google end to end on a phone, and the times.

It exits 0 when every line is as expected and the made-up user is gone, 1 otherwise, and 2 when it refused to run (it then asks nothing of any service).

## Running it

**The founder types, at their own terminal.** The secret key never passes through an AI session: not in chat, not in a file the session can read, not in a command the session runs.

1. **Read the project reference aloud** from the test copy's dashboard and from `supabase/site.json`. They must be different: the second is the tracker's.
2. **Give the two settings for this one command only**, without them showing or being saved. `SUPABASE_URL` is the test copy's project address (`https://<reference>.supabase.co`, nothing after it); `SUPABASE_SECRET_KEY` is its secret key (Project Settings, API Keys). Never put them in `.env`.

   In **Git Bash**:

   ```sh
   read -rs SUPABASE_URL; echo; read -rs SUPABASE_SECRET_KEY; echo
   SUPABASE_URL="$SUPABASE_URL" SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" node scripts/check-sign-in-service.mjs --hosted
   unset SUPABASE_URL SUPABASE_SECRET_KEY
   ```

   In **PowerShell**:

   ```powershell
   $env:SUPABASE_URL = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Project address')).Password
   $env:SUPABASE_SECRET_KEY = [Net.NetworkCredential]::new('', (Read-Host -AsSecureString 'Secret key')).Password
   node scripts/check-sign-in-service.mjs --hosted
   Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SECRET_KEY
   ```

3. **Read every line together.** A line marked NOTED is not a difference and does not change the result: "leaked-password protection is OFF on this project" only says the project lacks that paid setting, which is the founder's call (record 018, item 10). If any line says DIFFERED, **stop the session there** and give the lead the lines (they hold nothing secret). A difference means the adapter or the fake is wrong, and record 018 says to fix both together before anyone signs in. The lead decides which, in a change of its own; the session waits for it.
4. **Make the person's checks** from the last block, in the dashboard, and say each one aloud. For "Confirm email", switch it off, run the tool again and see its "Confirm email" line differ, then switch it back on.
5. **Write the result into the stage report:** every line as printed, the times, and the person's checks with what was seen.

Ctrl+C stops it after the check in hand and still removes the made-up user. A second Ctrl+C stops at once: the made-up user may then be left, and the tool says how to remove it by hand (Authentication, Users: the one made today whose address starts `check-sign-in-` and ends `.test`).

## On this computer

To see a good run without a real service, run its test: `node --test tests/check-sign-in-service.test.mjs`. It serves the fake on `127.0.0.1` and runs every check against it through the adapter's own client, then again with the fake answering one call in another shape.
