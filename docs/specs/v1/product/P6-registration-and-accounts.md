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
- **An address that already has an account (R-31, decided for you, November 15):** before the code, the screens are the same for every address. After the code, the password screen says the account already exists and that saving changes its password and signs out its other devices.
- **What makes it safe** (T-85): we never store or see a password, only a one-way scramble of it held by the sign-in service. A password must be at least 8 characters and is refused if it appears in the public lists of leaked passwords. Wrong guesses are slowed and then locked out. Changing a password signs out every other device.
- **Changing the password on the account page** (step 2.128, T-451, T-452): the current password and a new one, which follows the same rule as at sign-up. A wrong current password changes nothing and counts as a wrong sign-in does; a refusal says which box was wrong and never shows a password again. A change signs out every other device, keeps this one, and emails the account. An account made with Google has no password: it is told to set one through "Forgot your password?" (S-127).
- **Changing the email on the account page** (step 2.128, T-73, T-455, T-457): the new address and the current password (counted as a wrong sign-in when wrong). A 6-digit code goes to the new address, with the same limits as every code, and the old address is told that a change was asked, naming the new one (S-129); nothing changes until the code is typed. Asking again replaces the earlier change, whose code then no longer works; a new password ends a waiting change too. An address that already has an account answers exactly as a free one at every step, the first code typed included (no code is sent to it when our own records show that account). A right code changes the email, signs out every other device, keeps this one, and tells the old address again; a wrong, spent, expired or used-up code changes nothing. An account made with Google is told to set a password first (S-129).
- In practice people will rarely type it, because they stay signed in (R-9).

**R-21 (decided for you, November 14): a person is asked their name once, on the screen right after choosing a password** (or right after Google, if Google did not give one): first and last name, made into their own profile; answered, the screen goes on to the page that sent them there, else their account page (S-125). Anyone who signs up, a player or someone invited to help run a league, then has a name the league's staff can see on the Admins page and in the activity log, and every later form fills it in (step 3). The account is made at step 1 without a name, so asking at the first registration instead is a small change.

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
- **R-30 (decided for you, November 15):** signing out leaves a person on the league page they were on, or on our front page if they were on none, with "You are signed out."
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
- **R-15: adults are shown by full name by default**, and the league decides whether a player may ask to appear as initials. That switch is about adults: a request for a child always takes effect (R-25).
- **R-16: sensitive answers are seen only by those who need them.** Dates of birth, medical notes and emergency contacts are visible to league admins and registrars, not to scorekeepers, coaches of other teams or the public.
- **R-17 (agreed, changed November 12): leaving is not erasing.** A player who leaves a team or the league, or is replaced mid-season, stays in its history with their name. The games they played, their box score lines and their season totals remain for anyone to see, and the roster shows them as a former player. Faraj's Season 2 already works this way. Separately, a person can ask for their name to be taken off a league's public pages, or for their whole account to be deleted. Only then does the name go, and even then the numbers stay as a nameless entry so team totals still add up. How far that right reaches is question 11 for the lawyer.
- **R-23 (decided for you, November 14): a person's request about their name is set on their record by an admin or registrar.** "Show as" has three choices: as the league shows everyone, initials, or removed. The reason is kept in the activity log; it is always required and is one of a fixed list (the person asked, a guardian asked, the league decided), because the activity log keeps no typed words that could hold personal details. Removed keeps their numbers as a nameless line (R-17). The person sets it themselves once the account page has it (stage 4).
- **R-24 (decided for you, November 14): "Names on public pages" has three choices.** Full names; first name and last initial; or hidden, where a player is shown by jersey number only, like "#12" with the team on the statistics, and as "Name not shown" (the words a removed person gets) where there is no number; a roster, which has a number column, prints the number there once and reads "Name not shown" beside it (S-134). Every league starts on "Full names" with the confirmation not given, which shows adults by full name and children by first name and last initial, as before (R-29). The setting is followed for every player (R-29); under full names a child is shown in full only once the admin has confirmed the league has the permission it needs, a setting of its own (R-14), and a person's own request for less still wins (R-25). Switching to initials or hidden never asks for anything.
- **S-135 (decided for you, step 2.146): what League settings → Privacy says about names.** Where adults show in full and children do not, it says that the day a young player's name turns full tells their 18th birthday; in an adult league with players recorded as children it also says that the names tell who is a child, and that "first name and last initial" for everyone avoids it. It always ends with "To show less of one person, open their record in People and choose "Show as"" (R-23).
- **R-25 (decided for you, November 14): a request for less of a child always wins.** A request made for a child, or for a person of unknown age in a youth or mixed league, to be shown as initials or removed always takes effect, whatever the league's settings say: a guardian asking for less of their child to be public is never overruled by a league setting. Initials never show more than the league's own choice, so a child in a "hidden" league stays hidden. For an adult in a league where "Players may ask to appear as initials" is off, a request for initials is refused with a plain sentence saying the league does not offer initials and that "removed" is still there; it is never saved to do nothing. "Removed" always works for everyone (R-17).
- **R-26 (decided for you, November 14): in an archived or suspended league, a change that shows less of a person still works.** Setting a person's request to initials or removed, and moving "Names on public pages" toward less (full names to first name and last initial or hidden; first name and last initial to hidden), work there. A change that shows more is refused like any other change in a read-only league. U-9 already lets removing someone always work, and an archived league's pages stay public.
- **R-27 (decided for you, November 14): a request that was recorded keeps taking effect.** Once a person's request (initials or removed) has been accepted and saved, it is honoured on public pages until an admin or registrar changes that person's "Show as", whatever happens later: the league switching "Adults may ask to appear as initials" off, or the person's age changing from child to adult. The switch and the person's age decide only whether a new request for initials from an adult may be recorded. A name must never come back onto a public page as a side effect of some other change; only a deliberate change to that person's own record shows more of them.
- **R-28 (decided for you, November 14; changed November 17): a birth date or the tick makes someone a child.** A person counts as a child if their date of birth says so (under 18 today, in the league's time zone) or the "minor" tick on the record is on. A date that says adult does not untick anyone: to show more of a person, the admin unticks them. A date that cannot be read counts as a child. With no date and no tick the league does not know, and its audience decides (R-15), except for a player typed in at a scorer's table (below, S-136; R-28 changed in step 2.146). So a child is never shown by full name because a box was left unticked, a birth year was mistyped, or an 18th birthday came with nobody deciding. Someone born on 29 February is a child until 1 March in a year with no 29th. Built in step 2.93 part 5, ahead of the rest of step 2.146: one rule in core, which the database works out in its own reads, so a birth date never leaves it (record 080). A player typed in at a scorer's table comes with no age: with no date and no tick they count as a child until an admin says otherwise, by the tick either way or a date (S-136, step 2.146). They are shown as a child, not recorded as one: the S-109 put-back reads the date and the tick only. The admin keeps every choice (S-136 as amended in step 2.146's fix round): Admin → People lists them ("Added at the scorer's table, age not recorded", for a role that may see ages); their record says why they are shown as a child; choosing "An adult", "A child" or a date ends the rule for that person. The parents' confirmation for full names never covers a walk-up of unknown age (S-136 as amended in step 2.146's closing round): they are shown as a child whatever it says, until an admin marks them, so an adult league whose only children are walk-ups is not offered it. A walk-up typed as one word ("Walkington") may be a surname alone, so it is shown by its initial only ("W."); one typed in two parts keeps its first name ("Quill U."). A league with a walk-up of unknown age is kept out of search engines, as one with a recorded child is (U-18); the publish check still reads recorded children alone. Privacy says in one line that walk-ups are shown as children and keep the site out of search until marked, with a link to the list (T-518). Because a date never unticks anyone, Admin → People lists those ticked as children whom their birth date makes 18 or over ("Ticked as children, 18 or over"), for a role that may see ages, worked out in the database (T-517).
- **R-29 (decided for you, November 15; corrected the same day after the area lead's review): an admin's choice of less is followed for everyone, and nothing changes until they choose.** Every league starts as before: adults by full name (R-15), children by first name and last initial (R-14). "First name and last initial" and "Hidden", once chosen, apply to every player, adults included. "Full names" shows adults in full and children by first name and last initial, until the admin also confirms the parents' agreement, which is a setting of its own: the setting keeps when it was confirmed, and who confirmed is in the activity log (no screen shows who yet). Showing less never asks for a confirmation.
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
