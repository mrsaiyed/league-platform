# Brief for the lawyer and the accountant

[Spec home](README.md) · Decisions B-9, B-10, B-11

What to tell them, what to ask them, and what to bring. It is written so that the first meeting is not spent explaining the product.

I am not a lawyer and nothing here is legal advice. Where a law is named, the question is "does this apply to us, and what must we do?", not a claim that it does.

## 1. When each part is needed

| Before                                                 | What must be settled                                 |
| ------------------------------------------------------ | ---------------------------------------------------- |
| Now, during our own tests                              | The two items in section 2                           |
| Any stranger signs up (stage 5)                        | The company, terms of service, privacy policy (B-9)  |
| Any youth league other than our own demo uses it       | Children and students (B-10)                         |
| Any money is taken                                     | Payments and tax (B-11)                              |
| Anything is signed with TCSAAL, even for a small pilot | A pilot agreement (section 4, "TCSAAL and the demo") |

The founder's decision (November 12, 2026) is to do this after our own tests with Faraj and the demo league. That is fine for everything except section 2.

## 2. Two things that should not wait

These exist during our tests, so they cannot wait for the end of them. Neither needs a lawyer to start.

1. **Al-Hadi's players are minors, and their names and statistics are public on the live tracker today.** Get the school's permission in writing. An email from the athletic director or principal is a start. It should say the school agrees to its roster, scores and statistics being shown publicly, and that the school has whatever permission it needs from parents. Then ask the lawyer whether that is enough.
2. **The demo league uses TCSAAL's name, schedule and results.** Until TCSAAL agrees, label the site as unofficial and do not use their logo (F-10). Ask the lawyer whether anything more is needed.

## 3. What to tell them about us

One page they can read in five minutes.

**What it is.** A website service, working name SR Leagues. A person who runs a sports league gets a public site for the league and a private admin area to run it: teams, schedule, registration, live scoring, standings, messages to players. Every league runs on the same software.

**Who uses it.** League organizers and their helpers; scorekeepers; players, both adults and minors; parents; fans.

**What we hold about people.**

- Name and email address. A password, kept only as a one-way scramble by our sign-in provider.
- If a league's form asks: phone number, date of birth, emergency contact, shirt size, a photo, and answers to the league's own questions, which could include medical notes.
- Acceptance of a league's waiver: the wording, the typed name, the account and the time.
- Team, jersey number and game statistics.
- Messages posted in league chats, and a history of the notifications we sent.
- For children, the same, entered by a parent.

**What is public.** Names, teams, statistics and, if allowed, photos. For children the default is first name and last initial with no photo.

**Where it is kept.** Data centers in the United States, through these vendors: Supabase (database, sign-in, files), Render (servers), Cloudflare (network), Resend (email), Stripe (payments), Sentry (error reports), Google (as a sign-in option), GitHub (code).

**Money.** None yet. Later: a league pays us a price per season, by invoice. Players pay a league's registration fee by card; the money goes straight to the league's own Stripe account, and a platform fee comes to us. Sponsors may later pay leagues the same way.

**What we do not do.** No advertising, no selling of data, no tracking cookies. We do not run the leagues, hold their money, or supply referees, venues or insurance.

**Who we are.** Tell them: whether a company exists yet; who owns what; that one trusted second person has emergency access to the accounts; and that much of the code is written with AI assistance.

**Where.** TCSAAL and Al-Hadi are in Texas. Tell them where you and Faraj League are based.

## 4. Questions for the lawyer

### The company

1. Should this be a company (for example an LLC) before any outside league uses it? In which state?
2. Who owns the code and the name today? Much of the code is written with AI assistance: is anything needed to make ownership clear? If anyone else contributes work, what agreement do we need with them?
3. Is "SR Leagues", or whatever name we choose, free to use? Should we register a trademark?
4. Do we need insurance (cyber, professional liability) before strangers sign up?

### Terms of service

What we want them to say:

- We provide software. Each league is responsible for its own league: its rules, safety, referees, insurance, waivers, refunds and what it publishes.
- A league owns its data, can export all of it and can delete it.
- We can suspend a league for abuse or non-payment, with notice, and can take back a site name that impersonates someone.
- Limits on our liability, and no promise of uptime except in a signed contract.
- Rules for what may be posted, including in chats.

What we need to know:

5. Do we need separate terms for organizers and for players and parents?
6. How must people accept them for the acceptance to count? Is a ticked box at sign-up enough?
7. How do we change the terms later?

### Privacy policy

8. Please draft it from the data list in section 3.
9. For a league's data, are we the party responsible for it, or are we handling it on the league's behalf, or both? Who must answer a person who asks to see or delete their data?
10. Which state privacy laws apply to us at our size (Texas's, California's, others)? What do they require now, and what later as we grow?
11. When someone leaves a league we remove their name but keep a nameless line of statistics, so team totals still add up. Is that acceptable?
12. How long may we, or must we, keep accepted waivers and payment records?
13. If there is a data breach, whom must we tell, and how fast? Our own procedure says affected leagues promptly, and within 72 hours.
14. We use only the cookies needed for signing in. Do we need a cookie banner?
15. Which agreements do we need with our vendors about the data they hold for us?

### Children and students

16. **Under 13.** Our design is that a parent registers the child from the parent's own account, and the child has no sign-in. Does that meet the federal children's privacy law (COPPA)? What counts as verified parental consent for us? When a school enters its roster, can the school consent in place of parents?
17. **Ages 13 to 17.** They can have their own accounts. What does Texas law require for accounts held by known minors? Please look at the SCOPE Act (House Bill 18) in particular. What about other states?
18. **School rosters.** When a school or TCSAAL gives us student names, are those school records under FERPA? What must our contract with a school say? Does Texas law on student data held by school technology vendors apply to us?
19. **Showing minors publicly.** Names, statistics, photos and live game pages. What permission is needed, and from whom? Is our default (first name and last initial, no photo) sensible?
20. **Chats that include minors.** Our rules are in N-16: text only, no private one-to-one messages, parents stand in for children under 13. What else must we do? What are our duties if something illegal is posted?
21. The founder's view is that no age checks are needed in a league that does not ask for dates of birth. Is that right?

### Waivers and signatures

22. A league's waiver is accepted by ticking a box and typing a name. We store the wording, the name, the account and the time. Is that a valid signature? For a minor, a parent does it: is that enough? An admin can also mark a waiver as "collected by the league" (signed on paper), and we record who marked it and when. Should we require anything before allowing that?
23. The waiver is between the league and the player. Does hosting it create any risk for us, and what should our terms say?
24. Should we offer a template waiver, or never?

### Email and text messages

25. Which of our emails count as commercial (a league's announcements?) and which do not (reminders, recaps, sign-in codes)? What are the rules for each? We understand commercial email needs an unsubscribe link and a postal address, so we need a business mailing address.
26. Leagues send through us. Legally, who is the sender?
27. For text messages later: what consent do we need?

### Things people upload and post

28. Leagues upload logos and photos and write pages. Members post in chats. What protects us if something infringes copyright or is harmful, and what must we do to keep that protection? Do we need to register an agent for copyright complaints?
29. We plan "report this league" and "report this message" links. Is anything required of how we handle reports?

### TCSAAL and the demo

30. May we show TCSAAL's public schedule and results, and its member schools' teams, in an unofficial demo? May we show another school's roster where TCSAAL's own site already does? What should the notice say?
31. Please prepare a short agreement for a one-season pilot with an association. It should cover who owns the data, student privacy, support hours, uptime, the price, and how either side ends it.

### Accessibility

32. We build to the WCAG 2.2 AA standard. Is there a legal accessibility requirement when schools are the customers?

## 5. Questions for the accountant

1. How should the books be set up from day one, even while nothing is charged? What should we be recording now (vendor costs, time)?
2. Is what we charge leagues (software as a service) subject to sales tax in Texas, and in other states where leagues are? When must we register and collect?
3. How is the platform fee on registration and sponsor payments taxed and reported? Who issues tax forms to leagues: Stripe, or us?
4. With Stripe sending money straight to the league's own account, please confirm we are not holding or moving money in a way that needs a licence. (Also for the lawyer.)
5. Who bears refunds and chargebacks, and how are they recorded?
6. Many leagues are nonprofits or informal groups. Does that change anything about charging them?

## 6. What to bring

- This brief.
- [P6 section 7](product/P6-registration-and-accounts.md) (children and privacy) and [T4](technical/T4-tenancy-auth-security.md) (how data is protected).
- The list of vendors in section 3, with links to their terms.
- Screens of the registration steps, including the waiver step, once they exist.
- Faraj's current waiver wording, if it has one.
- The school's permission email from section 2.

## 7. What comes back into the spec

When the answers arrive, these are revisited: R-11, R-12 and R-14 (children), N-16 (chats), B-13 (sponsor payments), T-52 (how long records are kept), T-84 (what we do after a breach), and section 7 of T4.
