# P8 — Notifications

[Spec home](../README.md) · Decisions N-1 to N-16

"They'll get a notification in the site and to email with game-day reminders and game-day recaps." This file says exactly what is sent, to whom, when, and who controls it.

## 1. Where notifications appear

**N-1 (recommended): two channels at launch, the site inbox and email.** Every notification goes to the inbox. Most also go by email. Text messages and phone push notifications come later (section 9).

- **Inbox**: the bell beside the account button shows an unread count. It opens a list; each item links to the relevant page. `oursite.com/account/inbox` shows everything across all of a person's leagues, with a filter per league.
- **Email**: designed in the league's colors with the league's logo. The sender name is the league's ("Faraj League"). Replies go to the league's contact address, not to us.

## 2. Everything we send

| What                                                                                    | Who gets it                                                                       | When                                                                                 | Email too?     | Can the person turn it off?  |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------- | ---------------------------- |
| Sign-in code, password reset, new-device notice, email change, invitation               | The person                                                                        | Immediately                                                                          | Email only     | No                           |
| Registration received, approved, waitlisted, place offered                              | The registrant (the guardian for a child)                                         | Immediately                                                                          | Yes            | No                           |
| Payment receipt, refund                                                                 | The payer                                                                         | Immediately                                                                          | Yes            | No                           |
| You are on a team                                                                       | The player                                                                        | When placement or the draft is confirmed                                             | Yes            | No                           |
| Schedule published                                                                      | All players, guardians, coaches, followers                                        | When published                                                                       | Yes            | Yes                          |
| **Game-day reminder**                                                                   | Players, guardians, coaches and followers of both teams; the assigned scorekeeper | 24 hours before the game (section 3)                                                 | Yes            | Yes                          |
| Schedule change                                                                         | Everyone tied to the affected teams                                               | When the change is published                                                         | Yes            | Inbox always; email yes      |
| **Game recap**                                                                          | Players, guardians, coaches and followers of both teams                           | 10 minutes after the final, or once at the end of the day (the league's choice, N-5) | Yes            | Yes                          |
| Result corrected                                                                        | Those who got the recap                                                           | Only if the score or winner changed                                                  | Yes            | Yes                          |
| Announcement                                                                            | Whoever the admin chooses                                                         | Now, or at a time the admin sets                                                     | Admin's choice | Yes, except "essential" ones |
| Award won                                                                               | The winner                                                                        | When published                                                                       | Yes            | Yes                          |
| For admins: registration waiting, game with no final score, bouncing email, draft ready | League admins with the matching role                                              | As it happens; unfinished games 3 hours after start                                  | Daily summary  | Yes                          |

## 3. The game reminder

**When.** **N-2 (agreed, changed November 12): 24 hours before the game starts.** The league can change this: a different number of hours ahead, or a fixed hour on the morning of the game, and it can add a second, shorter reminder (off by default).

- If that moment falls at night, between 10:00 pm and 8:00 am league time, the reminder is sent at whichever of those two times is closer.
- A game that is added or moved with less than the reminder time to go gets no reminder; the schedule-change notice covers it.

**One per person per day.** **N-3 (recommended):** a parent with two children playing, or a player on two teams, gets one reminder listing all of that day's games, sent 24 hours before the first of them.

**What it says.** For each game: opponent, time, venue and court with a map link, which team is home, both teams' records, and a button to add it to the calendar. Then the league's own note if it set one ("Bring both jerseys. Doors open 5:30").

> **Faraj League — you play tomorrow**
> **Jaysh vs. Ansar** · 7:00 PM · Main Gym, Court 1
> Jaysh are 4–1 (2nd, Mecca). Ansar are 3–2 (1st, Medina).
> _From the league: Bring both jerseys. Doors open 5:30._
> [Game page] [Directions] [Add to calendar]

**If the game moved or was cancelled** after the reminder went out, a schedule-change notice follows immediately, marked urgent.

## 4. The game recap

**When.** Ten minutes after the scorekeeper ends the game (the pause catches a mistaken final). **N-4 (recommended):** for games recorded as final-score-only, the recap is shorter but still goes out.

**What it says.**

- The final score and winner.
- **Your line**: for a player, their own stats; for a guardian, their child's; for a follower, nothing personal.
- Top performers on each team.
- What it means: each team's new record and place in the standings.
- Their next game.
- A button to the full box score.

> **Final: Jaysh 58, Ansar 51**
> **Your game:** 14 points, 2 threes, 3 fouls, 22 minutes
> Top scorers: S. Ghori 18 (Jaysh) · A. Abbas 16 (Ansar)
> Jaysh move to 5–1, 1st in Mecca. Next: vs. Fursan, Sunday Nov 22, 6:00 PM
> [Full box score]

**N-5 (agreed, changed November 12): the league's admin chooses how recaps go out.** In Admin → Messages:

- **After each game** (the default). Ten minutes after the final. If two games a person cares about end within the same ten minutes, they arrive as one message.
- **Once at the end of the day.** One message after the league's last game that day is final. If a game is still not final three hours after it started, the day's message goes without it, and that game gets its own recap when it is finalized.
- **Off.**

**N-6 (later): a written summary of the game** produced automatically from the play-by-play ("Jaysh pulled away with a 12–2 run to open the second half"). It is a real differentiator and the data for it already exists, but it must be accurate and suitable for youth leagues, so it waits until the plain recap has run for a season.

## 5. What a person controls

Under `/account` and under each league's `/my` page:

- A grid of notification types against channels (inbox, email), per league. Everything starts on.
- Essential messages (sign-in, registration status, payments, urgent changes on game day) cannot be turned off.
- Every non-essential email has a one-tap unsubscribe that turns off that type for that league, with a link to the full settings.
- A guardian chooses for each child. A second guardian has their own choices.

## 6. What the league controls

In **Admin → Messages**:

- **Reminders and recaps**: on or off for the league, how far ahead the reminder goes (N-2), the optional second reminder, whether recaps go after each game or once a day (N-5), the league's standing note, and a different note for a specific game.
- **Preview and test**: see each message as recipients will, and send a test to yourself.
- **Announcements**: write a message; choose the audience (everyone, a division, a team, captains and coaches only, people with unpaid fees, the waitlist); send now or schedule; optionally also publish it as a news post. An announcement can be marked essential (a venue closure), which overrides people's opt-outs. That marking is logged.
- **History**: everything the league has sent, to how many people, and how many were delivered, opened or bounced.
- **Group chats** for the whole league, a division, a team or any group the admin makes (section 10).
- **N-7 (agreed, changed November 12): group chats inside the product, and a "copy for group chat" button as well.** The founder wants leagues to talk to their people here, with the admin deciding who is in each chat and whether everyone can talk or only announcements are posted. That is section 10. The copy button stays on every recap and announcement, giving a clean text version to paste into WhatsApp or similar, because many leagues will keep their existing group for a while.

## 7. Rules we hold ourselves to

- **N-8: nothing is ever sent twice.** If a game is ended, reopened and ended again, the recap does not repeat (the correction rule in the table applies instead).
- **N-9 (changed November 12; revisited before stage 5): no limit on announcements for now.** The only leagues on the platform are our own, and an admin should be free to message their league. The question comes back before sign-up opens to strangers, because every league sends from our mail domain, and one league that spams would hurt delivery for all of them (T-139).
- **N-10: bad addresses are handled.** After a hard bounce we stop emailing that address, flag it to the league admin, and ask the person to fix it at their next sign-in.
- **N-11: a message is built at the moment it is sent**, so it reflects the latest time and venue, not what was true when it was queued.
- **N-12: delivery does not depend on anyone having a page open.** Reminders and recaps are sent by a background service ([T7](../technical/T7-notifications-and-jobs.md)).
- Email law (unsubscribe links, a postal address in the footer) is followed; exact wording is confirmed in the legal review (B-9).

## 8. Sending identity

**N-13 (recommended):** emails come from an address on our own mail domain with the league's name shown, for example `Faraj League <farajleague@mail.oursite.com>`. This lets us keep a good sending reputation for all leagues. Later, a league can send from its own domain after proving it owns it.

## 9. Later

**N-14:** in order of likely value: phone push notifications (people add the league site to their home screen and allow notifications; no app store needed); text messages for urgent game-day changes, which cost money per message and so will be priced in; and "live now" alerts for followers when a game tips off.

## 10. Group chats

The founder's direction (November 12): a league should be able to run its conversations here. One chat for the whole league, or one per division, per team, or for any group the admin picks. Each chat is either announcements only, or open for everyone in it to talk.

**N-15 (new, recommended; needs the founder's yes on the order): chats arrive in two steps.**

Step 1, with accounts and notifications (stage 4): **announcement chats.**

- Every league gets a league-wide chat. The admin can add chats for a division, a team, captains only, or a hand-picked group.
- Team and division chats fill themselves from the rosters, so a team's chat always matches the team.
- Only admins post, and in a team's chat its captain or coach. Everyone else reads. Each post also arrives in the inbox and by email, like any announcement.
- This step is cheap, because it is the announcement system with a memory: the audience becomes a standing group, and its history is one page anyone in it can scroll.

Step 2, after sign-up is open to strangers (after stage 5): **open chats**, where every member can write.

- The admin switches any chat from "announcements only" to "everyone can talk".
- This is a bigger feature. It needs messages to appear live, it needs phone push notifications (N-14) because nobody wants an email for every chat message, and it needs the moderation tools below.

Why this order: an open chat competes with WhatsApp, which is free and already on everyone's phone, and it only wins once we have push notifications. An announcement chat does not compete. It is the league's official voice, it follows the rosters by itself, and it works by email from day one.

**N-16 (new, recommended; needs the founder's yes): rules for every chat.**

- Text and links only at first. No pictures or files. Pictures are where the serious risks of a chat feature are, and leaving them out keeps moderation manageable.
- No private one-to-one messages. Every chat is a group that the league's admins can see.
- A child under 13 is represented in chats by their parent (R-11). A youth league can keep all its chats announcements-only, and an open chat in a youth league always includes at least two adults.
- Admins can remove a message, mute a member and close a chat. Any member can report a message; reports go to the league's admins, and to us if the league does not act.
- Chat history is part of the league's export (O-9) and is deleted with the league (O-10).
