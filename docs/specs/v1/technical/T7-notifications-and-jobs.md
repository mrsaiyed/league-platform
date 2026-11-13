# T7 — Notifications and background jobs

[Spec home](../README.md) · Decisions T-130 to T-148, T-224

How reminders, recaps and every other piece of delayed or scheduled work ([P8](../product/P8-notifications.md)) actually happens.

## 1. The worker and its queue

The **worker** is the second of our two programs (T1 section 2). It does nothing but take jobs from a queue and carry them out. The queue is tables in the same PostgreSQL database as everything else: our own `jobs` table, where every job is recorded, and, in staging and production, the pg-boss library's tables, where the worker hands each job over to be run.

- **T-130: a job is recorded in the same transaction as the change that causes it.** "Game finalized" and "send its recap at 7:52" are saved together or not at all. A crash between the two cannot happen, so a recap is never lost and never sent for a result that was not saved.
- **T-131: a job carries identifiers, not content.** It says "recap for game G", not the score. The content is built when the job runs (N-11), which keeps it current and keeps personal data out of the queue. The database refuses anything else: a job's ids are at most ten UUIDs or dates.
- A job has a name, the league it belongs to, the earliest time it may run, a count of attempts, and optionally a key that prevents a duplicate of itself being queued.
- Several workers can run at once. A job is leased to one worker at a time; if that worker dies, the lease expires and another takes it.
- **T-224: the `jobs` table is behind the league fence** like every other league table, so a request records and sees only its own league's jobs. The worker takes due jobs from every league through one narrow owner-run function that returns ids only. In staging and production it hands each one to pg-boss under the job's own id (a repeated handover is ignored) and pg-boss runs it; for local work and tests the jobs run straight from the table. Detail: [decision record 012](../../../architecture/decisions/012-the-jobs-table-and-pg-boss.md).

## 2. Every job

| Job                            | Started by                                                                                                   | What it does                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reminders.plan`               | A timer, every 15 minutes                                                                                    | For each league: find games whose reminder moment (24 hours before the start, or the league's own setting) has arrived, and queue one `reminders.send` per person |
| `reminders.send`               | `reminders.plan`                                                                                             | Builds one person's reminder for one league and one game day, and delivers it                                                                                     |
| `recaps.plan`                  | A game being finalized, delayed 10 minutes; or the end of the game day, where the league chose a daily recap | Checks the game is still final; queues one `recaps.send` per person                                                                                               |
| `recaps.send`                  | `recaps.plan`                                                                                                | Builds one person's recap and delivers it                                                                                                                         |
| `notify.event`                 | Registration decided, team placement, schedule published or changed, award given                             | Works out the audience and creates notifications                                                                                                                  |
| `announcements.send`           | An admin, now or at a set time                                                                               | Works out the audience in batches and creates notifications                                                                                                       |
| `email.send`                   | Any of the above, one per email; inviting and re-sending an invitation (ids: `invitationId`)                 | Renders the template, hands it to the email service, records the outcome; an invitation's link is made as it sends (T-226)                                        |
| `email.status`                 | The email service calling us back                                                                            | Marks delivered, bounced or complained; suppresses bad addresses (N-10)                                                                                           |
| `waitlist.expire`              | A timer, every 15 minutes                                                                                    | Passes an unaccepted place to the next person (48-hour rule)                                                                                                      |
| `games.unfinished`             | A timer, hourly                                                                                              | Tells admins about games started over 3 hours ago with no final                                                                                                   |
| `schedule.generate`            | An admin pressing Generate                                                                                   | Runs the schedule builder and stores the proposal                                                                                                                 |
| `imports.run`, `exports.build` | An admin                                                                                                     | Processes a spreadsheet; builds a download                                                                                                                        |
| `cache.clear`                  | Publishing, finalizing                                                                                       | Clears the affected cache labels at Cloudflare                                                                                                                    |
| `standings.rebuild`            | An admin or us, rarely                                                                                       | Recalculates a season from scratch                                                                                                                                |
| `chat.deliver`                 | A post in a chat                                                                                             | Creates inbox items and emails for an announcement chat; pushes the message to members who have an open chat on screen                                            |
| `bin.empty`, `sessions.tidy`   | A timer, nightly                                                                                             | Permanent deletion after 30 days; housekeeping                                                                                                                    |

## 3. From an event to a message

Every notification follows the same five steps inside the `notifications` module.

1. **Event.** Something happened: `game.finalized`, `schedule.changed`, `registration.approved`.
2. **Audience.** Who cares? For a game: both teams' roster entries → those people → the accounts that act for them (the player themself, or each guardian of a child) → plus followers of either team → plus coaches.
3. **Preferences.** Drop anyone who has turned this type off for this league, unless it is essential.
4. **Inbox.** Create a `notifications` row per account, with a `dedupe_key`.
5. **Email.** For those with email on for this type, queue `email.send`.

- **T-132: the dedupe key is the guarantee against duplicates.** The key for a recap is built from the type, the game and the account. The database refuses a second row with the same key, so ending, reopening and ending a game again cannot send a second recap, whatever the code does. Corrections use a different, deliberate key (S-8).
- **T-133: guardians are resolved at step 2**, through `profile_access`. A child's own account, if a league allows one, is simply another entry there.

### Combining messages

- **T-134:** `reminders.send` is one job per person per league per game day. It is sent for the first of that person's games that day and lists all of them (N-3). Its dedupe key is the account, the league and the date, so a second game that day cannot produce a second reminder.
- **T-135:** recaps follow the league's choice (N-5). After each game is the default, and two games a person cares about that finish within the same ten minutes are combined into one message. Once a day sends a single message after the league's last game of the day is final; a game still not final three hours after its start is left out and gets its own recap later. Off sends none.

## 4. Time

- **T-136:** each game's reminder moment is worked out in its league's time zone, including daylight-saving changes and quiet hours (10:00 pm to 8:00 am, N-2). `reminders.plan` records for each game that its reminder has been planned, so a restart cannot plan it twice or skip it. A game added or moved inside the reminder window gets none; the change notice covers it.
- Reminders land within 15 minutes of their moment. Recaps land 10 to 12 minutes after the final.
- Nothing non-urgent is sent between 10:00 pm and 8:00 am league time.

## 5. Not failing, and failing safely

- **T-137: jobs may run more than once; their effects may not.** Every job is written so that running it twice does no harm: dedupe keys for notifications, a recorded delivery row checked before an email is sent, the email service's own duplicate protection.
  - The invitation email is the agreed exception (record 014): each run makes a new link, so a second run sends a second email whose link ends the first. Its duplicate protection is per link, and it records no delivery row yet; the delivery row and its outcome come with the deliveries table (record 023).
- A failed job is retried with increasing waits (about five attempts over an hour). After that it goes to a failed list that we are alerted about and can re-run.
- **T-138: fairness between leagues.** Jobs run in three priority classes: account and registration messages first, then reminders and recaps, then announcements. Large sends are cut into batches, and one league may only occupy a share of the workers at a time. A big league's announcement to 20,000 people cannot delay a small league's game-day reminders.
- If the email service is down, `email.send` jobs wait and retry; inbox notifications are unaffected.

## 6. Email delivery

- **T-139:** all mail goes from our sending domain (N-13), set up with the standard proofs of authenticity (SPF, DKIM, DMARC) so that mailbox providers trust it. Account mail (codes, password resets) goes from a different sending address than league announcements, so a complaint about an announcement cannot hurt the delivery of sign-in mail.
- The sender name is the league's; replies go to the league's contact address.
- Every non-essential email carries the standard one-click unsubscribe header as well as the link in the body.
- Bounces and spam complaints come back to `email.status`, in messages verified by the email service's signature. A hard bounce or a complaint adds the address to `email_suppressions`; we never send to it again until its owner fixes or re-confirms it.
- Templates live in `packages/emails`, drawn with the league's logo and colors, each with a plain-text version. They are to be React Email components; until the repository has a React toolchain they are plain TypeScript functions that return HTML text, with every value escaped, and the first ones carry no logo or colors yet (record 023, T-235). The template's callers do not change when it moves to React Email.
- **T-140: outside production, no email leaves the building.** Messages are captured to a viewer for inspection. Together with T-13 this makes it impossible to email real people from a test.
- **T-141:** each league has a monthly email allowance: a fair-use limit, adjustable in what is agreed with it (B-4). A league approaching it is warned; essential messages are never blocked by it.

## 7. The inbox

The inbox is the `notifications` table read by account. The bell's count is one indexed query, refreshed when a page loads and when the person returns to the tab. It does not need a live connection at launch.

## 8. Volumes (estimates)

| League       | People notified                  | A busy day | Emails that day |
| ------------ | -------------------------------- | ---------- | --------------- |
| Faraj        | about 70                         | 3 games    | about 100       |
| TCSAAL-sized | about 30,000 including guardians | 300 games  | about 25,000    |

Email is the main cost that grows with use, which is why allowances are tied to plans. The large figure is within what email services handle routinely; it will be exercised in the load test (F-5).

## 9. Running the worker

- One worker at launch; more are added by changing a number.
- On shutdown it finishes the jobs it holds or releases them.
- We watch three numbers: how many jobs are waiting, how old the oldest waiting job is, and how many have failed. **T-142:** an alert fires if a job has waited more than 10 minutes or any job lands in the failed list.

## 10. Group chats

How N-15 and N-16 work underneath. The tables are in [T3](T3-data-model.md) section 11.

- **T-147: a chat is ordinary league data plus the delivery we already have.** Posting is a command like any other and is checked on the server: is this account a member, may it post in this chat's mode, is it muted. Announcement chats deliver through the five steps in section 3. Open chats (later) add live delivery over the same push service as live games, on a private channel per chat that only current members can join, and they depend on phone push notifications to be useful.
- **T-148: chat safety is enforced by the server, not by the screen.** A message is text; no picture or file can be stored in one. Links are shown as plain links, and we do not fetch previews from other sites. Membership of team and division chats is recalculated from rosters, so someone removed from a team loses its chat at once. A removed message is hidden from everyone, kept for 30 days for the league's admins and for us in case of a report, then erased. Each member has a posting limit per chat.

## 11. Tests

- **T-143:** reminder planning with a controlled clock across several time zones and both daylight-saving changes: each person gets exactly one reminder per game day, at the right moment and never in quiet hours.
- **T-144:** end, reopen and end a game: exactly one recap. Change the winner: exactly one correction.
- The preference grid: every type and channel combination is honored; essential messages always arrive.
- A child with two guardians: both receive; a guardian who opted out does not.
- **T-145:** a bounced address is suppressed and flagged to the league.
- **T-146:** fairness: a 20,000-recipient announcement and a small league's reminders queued together; the reminders finish within their 15-minute target.
- Chats: a non-member cannot read or post; a muted member cannot post; removing someone from a roster removes them from the team's chat.
