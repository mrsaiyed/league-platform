# P6 — Registration and accounts

[Spec home](../README.md) · Decisions R-1 to R-22

This covers how people get into a league, how that gives them an account, and how they stay signed in. It is the centre of the vision: "through each registration an account is built, and when that person visits the site again it should keep them logged in."

## 1. What the organizer sets up

Registration belongs to a season. In **Admin → Registration** the organizer sets:

| Setting         | Choices                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who signs up    | **Individuals** (placed on teams later), **teams** (a captain signs up a team and brings players), or both                                                                                                                                                                        |
| Dates           | Opens and closes. Optional early window for last season's players.                                                                                                                                                                                                                |
| Capacity        | Total places, or places per division. What happens when full: waitlist, or closed.                                                                                                                                                                                                |
| Approval        | Automatic, or each sign-up waits for an admin to approve                                                                                                                                                                                                                          |
| Who may sign up | Anyone with the link, or invited people only                                                                                                                                                                                                                                      |
| The form        | Standard questions switched on or off and marked required: phone, date of birth, emergency contact, shirt size, position, skill level, "I want to play with...", photo. Plus the league's own questions: short answer, long answer, pick one, pick several, yes/no, number, date. |
| Agreements      | One or more texts the person must accept (waiver, code of conduct). Accepting means ticking a box and typing their name.                                                                                                                                                          |
| Fee             | Free, or an amount per player or per team (section 9, a later stage)                                                                                                                                                                                                              |

The form is previewed exactly as a registrant will see it. Changing the form or an agreement after sign-ups have started does not alter what earlier registrants answered or agreed to; their version is kept.

## 2. An individual signs up

On the league site the person taps **Register**. The page shows the season, dates, fee and places left.

1. **Email.** They enter their email, type the 6-digit code we send to prove the address is theirs, and choose a password. Or they tap "Continue with Google". If they are already signed in, this step is skipped. **This is the moment the account is created.**
2. **Who is this for?** "Me", or in youth leagues "My child". A person who already manages children picks one or adds another.
3. **The form.** Anything we already know (name, phone, date of birth) is filled in.
4. **Agreements.** Read, tick, type name.
5. **Payment**, if the league charges and takes payment online.
6. **Done.** The screen says where they stand: **Confirmed**, **Waiting for approval**, or **On the waitlist, position 4**. The same message arrives by email and in their inbox on the site.

Progress saves at every step. Someone who stops midway finds it waiting when they return, and gets one reminder email after 24 hours.

**R-1 (agreed): ask for the email first, not last.** It adds a small step up front, but it guarantees the email address works (every later reminder and recap depends on it), lets us save a half-finished form, and removes the "now create an account" step people hate at the end.

**R-2 (agreed, changed November 12): classic email and password, plus Google.** The founder prefers the familiar way, provided it is secure.

- **New account:** email, a 6-digit code to prove the address works, then choose a password.
- **Coming back:** email and password, or Google.
- **Forgot the password:** "Email me a code" signs them in and lets them set a new one.
- **What makes it safe** (T-85): we never store or see a password, only a one-way scramble of it held by the sign-in service. A password must be at least 8 characters and is refused if it appears in the public lists of leaked passwords. Wrong guesses are slowed and then locked out. Changing a password signs out every other device.
- In practice people will rarely type it, because they stay signed in (R-9).

**R-21 (decided for you, November 14): a person is asked their name once, on the screen right after choosing a password** (or right after Google, if Google did not give one): first and last name, made into their own profile. Anyone who signs up, a player or someone invited to help run a league, then has a name the league's staff can see on the Admins page and in the activity log, and every later form fills it in (step 3). The account is made at step 1 without a name, so asking at the first registration instead is a small change.

## 3. A captain signs up a team

1. The captain does step 1 above, then enters the team: name, preferred division, color.
2. They pay the team fee if there is one, or each player pays their own share, as the league set it.
3. They get an **invite link and QR code** for their players.
4. Each player opens the link, does step 1, fills in the player form and agreements, and appears on the roster.
5. The captain sees who has joined and who has not, and can nudge them. The league sets the smallest and largest roster and the deadline.

## 4. The admin adds people by hand

"Or the admin adds people manually if he prefers." In **Admin → People**: add one person (name is the only required field), or paste or import a list.

**With an email address.** The person receives "You have been added to Faraj League" with a button. Tapping it proves the address is theirs; they choose a password and are in. They are asked to complete anything missing, including agreements.

**Without an email address.** The person exists in the league as a **profile without an account**. They appear on rosters and in statistics like anyone else. They can be connected to a real account later in three ways:

- the admin adds their email, which sends the invitation above;
- the admin or captain shows them a personal QR code or link ("claim your profile");
- they register themselves another time, and the admin is shown "this looks like the same person" and merges the two.

**R-3 (recommended): a league's record of a person and the person's account are separate things that get linked.** This is what lets an admin build a whole league by hand on day one and have accounts attach gradually, with all statistics and history preserved.

**R-4 (agreed, changed November 12): the admin decides what to do about a waiver for someone they added by hand.** A waiver is the person's own promise to the league, so the site cannot pretend the person ticked the box. But the league is the admin's to run. Beside anyone added by hand the admin sees "agreement missing" and has three choices:

- send the person a link so they accept it themselves;
- mark it **collected by the league** (for example, signed on paper), which clears the flag and records which admin said so and when;
- leave it.

Nothing stops the person from playing unless the league chooses that. The one thing the record never says is that a person accepted online when they did not, because that record is what protects the league if there is ever a dispute.

## 5. The account

- **R-5: one account per person, for the whole site** (U-11). Joining a second league adds a membership; it does not create a second account.
- **R-6: the account is identified by a verified email address.** Changing it requires confirming the new address. A phone number is optional and kept for possible text messages later.
- **R-7: one account can manage several people.** A parent's account holds their own profile and each child's. A family sharing one email address works the same way.
- **R-8: if someone loses their email address**, we restore access only after checking with a league admin who knows them. There is no self-service bypass.

### Staying signed in

**R-9 (agreed, changed November 12): once signed in on a device, a person stays signed in on that device until they sign out.** There is no time limit, for players, parents, fans or admins.

- A person is signed out only if: they sign out; they use "sign out everywhere"; their password is changed (which signs out their other devices); or the browser itself forgets them. Browsers discard a sign-in after about 13 months without a single visit. That limit is the browser's, not ours.
- Because an admin's phone may now stay signed in for years, the few dangerous actions ask for the password again if it was not entered in the last hour: exporting everyone's data, deleting things for good, changing roles or ownership, and payout details. Everyday admin work never asks.
- An email is sent when an account is signed in on a device it has not used before.
- The account page lists signed-in devices, with "sign out everywhere".
- Because the whole site is one address (U-1), being signed in for one league means being signed in for all of them.

## 6. What a signed-in person gets

On any league they belong to:

- The account button at the top right, with a bell showing unread notifications.
- On the league home: a strip with **their next game** (when, where, opponent) and their team highlighted in standings and schedules.
- **`/{league}/my`**: their team and teammates, their schedule with a button to add it to their phone's calendar, their own statistics, their registrations and receipts, and their notification choices for this league.
- Captains and coaches also get team tools there: roster, lineup, message the team.

**R-10 (agreed): fans can follow a team, and nobody needs an account just to look.** Every public page of every league is open to anyone: schedules, standings, team pages, live games, box scores. There is never a sign-in wall in front of viewing. Tapping **Follow** on a team page asks for sign-in (creating an account if needed), and from then on they get that team's reminders and recaps. This turns parents, friends and alumni into account holders without any registration form. A visitor can also mark "my team" on their device without an account (U-5).

## 7. Children and privacy

TCSAAL and Al-Hadi involve students, so this is designed in from the start. The legal details need a lawyer's confirmation (B-10).

The founder's view (November 12): no age monitoring is needed, because nothing on the site is age-restricted. On monitoring I agree. We never check anyone's age, and an adult league like Faraj never asks for a date of birth. There is one rule I am not willing to drop without a lawyer saying we can:

- **R-11 (recommended; I disagree with dropping it; needs the founder's answer): in a youth league, a child under 13 is registered by a parent and has no sign-in of their own.** This has nothing to do with what is on the site. United States law (COPPA) restricts collecting personal details directly from children under 13 without a parent's verified consent, and no league can accept a waiver signed by a child anyway. A parent filling in the form is how youth registration works everywhere. The rule only applies where a league asks for dates of birth. It is on the lawyer's list ([brief](../LEGAL-BRIEF.md)); if the lawyer says it is unnecessary, it goes.
- **R-12 (revised November 12 to be simpler; needs the founder's yes): from 13 up, a player can have their own account like anyone else.** A youth league can require a parent's agreement on the waiver, and a parent can be attached as a guardian to receive the same notifications. (Before: guardian-managed by default.)
- **R-13: a child can have more than one guardian.** The first guardian invites the second.
- **R-14 (agreed November 12 as a starting setting the league can change): public pages show little about children by default.** In a youth league the starting setting is first name and last initial, no photo, and never a date of birth or contact details. The league's admin can switch to full names and photos, confirming that the league has the permission it needs; schools usually collect that from parents already. The founder asked whether this is a legal requirement. It is not one I can point to. It is a careful starting point, and what the law actually requires for showing minors is question 19 in the [brief](../LEGAL-BRIEF.md).
- **R-15: adults are shown by full name by default**, and the league decides whether a player may ask to appear as initials.
- **R-16: sensitive answers are seen only by those who need them.** Dates of birth, medical notes and emergency contacts are visible to league admins and registrars, not to scorekeepers, coaches of other teams or the public.
- **R-17 (agreed, changed November 12): leaving is not erasing.** A player who leaves a team or the league, or is replaced mid-season, stays in its history with their name. The games they played, their box score lines and their season totals remain for anyone to see, and the roster shows them as a former player. Faraj's Season 2 already works this way. Separately, a person can ask for their name to be taken off a league's public pages, or for their whole account to be deleted. Only then does the name go, and even then the numbers stay as a nameless entry so team totals still add up. How far that right reaches is question 11 for the lawyer.
- **R-23 (decided for you, November 14): a person's request about their name is set on their record by an admin or registrar.** "Show as" has three choices: as the league shows everyone, initials, or removed. The reason is kept in the activity log. Removed keeps their numbers as a nameless line (R-17). The person sets it themselves once the account page has it (stage 4).
- **R-22 (decided for you, November 14): when a parent deletes their account, a child's profile goes with it only if no other guardian manages it.** A child another guardian also manages (R-13) stays with that guardian, and so does a teenager's own profile that a parent also manages. A profile still on a league's roster is first removed from that league by the league (R-17), so deleting an account never changes a league's records behind its back.

## 8. Capacity and the waitlist

- Places are counted so that two people taking the last place at the same moment cannot both get it.
- When full, sign-ups join the waitlist and are told their position.
- When a place opens, the next person is offered it and has **48 hours** to accept before it passes on. An admin can also move anyone in by hand.
- **R-18:** a person on the waitlist is not charged until they accept a place.

## 9. Fees (a later stage)

Built at stage 5 of the [build order](../technical/T10-build-order.md).

- The league connects **its own payment account**. Fees go straight to the league. Any platform fee (B-4, not yet decided) is taken automatically, and we never hold the league's money.
- Fee per player or per team; early-bird pricing by date; discount codes; a sibling discount.
- The league's refund policy is shown before payment. Admins issue refunds from the registration record.
- **R-19:** a league can also mark someone "paid in person". We charge no fee on that.
- Receipts are emailed and kept under `/{league}/my`.

## 10. After registering

- Placed on a team by hand or by draft: they are notified "You are on Jaysh" with the team and schedule.
- Next season: **R-20: returning players register in one tap**, with last season's answers filled in and only the agreements and anything changed to confirm.

## 11. Awkward cases

| Case                                                        | What happens                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Same person signs up twice                                  | Stopped: "You are already registered for Fall 2026", with a link to their registration |
| Mistyped email, code never arrives                          | They can go back and correct it; nothing was created for the wrong address             |
| Parent registering two children                             | After the first: "Register another child?" with family details kept                    |
| Admin added "Ali Raza" by hand; Ali later registers himself | Admin sees a possible duplicate and merges; Ali's history is kept                      |
| Captain drops out                                           | Admin names a new captain; team and registrations are unaffected                       |
| A person's email starts bouncing                            | Flagged beside their name in People; they are asked to update it at next sign-in       |
| Registrant is under the league's minimum age                | The form explains and stops, or switches to the guardian path                          |
| Player belongs to two leagues                               | One account, two memberships, one inbox                                                |
