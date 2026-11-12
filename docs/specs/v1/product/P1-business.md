# P1 — Business

[Spec home](../README.md) · Decisions B-1 to B-13

## 1. Who buys this

The buyer is the person who runs a league. We call them the **organizer**. They are usually a volunteer or a part-time director, not a software person. They come to us because running a league today means a spreadsheet for sign-ups, a group chat for announcements, a paper scoresheet, and a website nobody updates.

Two kinds of customer shape the product, and we know a real example of each. A third real organization, Al-Hadi, is not a customer: it is a team we track ourselves and use to show the product to a league (B-2).

| Kind                     | Example                              | Size                                           | What they need most                                      |
| ------------------------ | ------------------------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| Small independent league | Faraj League, which the founder runs | 6 teams, one sport, a few seasons a year       | A site they are proud of, a draft, live stats, awards    |
| Association              | TCSAAL                               | Many schools, many sports, districts, playoffs | Many admins with limited powers, bulk tools, reliability |

**B-1 (agreed, changed November 12): Faraj League is the first customer, and a demo for TCSAAL is the first sales target.**

- The founder runs Faraj, so we are our own first customer. The first release is judged by whether Faraj can run on it.
- By the end of Al-Hadi's 2026–27 season we have a demo to show TCSAAL: one of its own member schools, tracked live all season by that school's people, shown inside a league site ([P9](P9-faraj-and-tcsaal.md) section 3).
- The demo opens the conversation. It does not promise the whole association. An association takes months to say yes and needs things (delegated school admins, eligibility, playoffs across districts) that are built at stage 6. What we ask TCSAAL for is a pilot.
- Nothing we build for Faraj may block the association: the data and addresses have room for TCSAAL's shape from day one ([P2](P2-leagues-and-urls.md)).

**B-2 (agreed, changed November 12): there is no "one team" customer for now.** We sell to leagues. Al-Hadi is a team we run ourselves inside a demo league that we own, so that a league can see the product working on real games. If single teams later ask for a site of their own, a team is simply a league that features one team, and nothing needs rebuilding (U-5).

## 2. Who uses it

| Person              | What they do here                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Organizer (owner)   | Signs up, owns the league, pays us, has every power                                         |
| League admin        | Has the same access as the owner for running the league; a league can have any number (O-7) |
| Club admin          | In big leagues: a school's athletic director; manages only that school's teams              |
| Coach or captain    | Manages one team's roster and lineup; sees that team's registrations                        |
| Scorekeeper         | Scores assigned games on a phone or tablet                                                  |
| Player              | Registers, sees their schedule and stats, gets reminders and recaps                         |
| Parent or guardian  | Registers a child, receives the child's notifications                                       |
| Fan                 | Visits the league site, watches live games; may follow a team                               |
| Us (platform staff) | Help customers; can look into a league only with a logged reason                            |

## 3. What we sell

One product. Setup is self-serve: an organizer can build and run everything without talking to us. The price is agreed in conversation for now (B-4). What they get:

1. A league home on our site at `oursite.com/their-league`, designed with their colors, logo and choice of sections.
2. An admin area to run seasons: teams, rosters, drafts, schedule building, results, standings, statistics.
3. Registration: forms they design, waivers, and (later) fees paid online to them.
4. Game day: live scoring on a phone or tablet, live game pages for fans, box scores.
5. Accounts for everyone in the league, with reminders and recaps in the site and by email.
6. Optional extras they switch on: awards and trophies, sponsors, media, draft night.
7. Their history kept season after season, and the right to export all of it.

**B-3 (agreed): we never write code for one customer.** When a league asks for something we lack, there are three possible answers: it is already a setting; we build it as a feature every league can switch on; or we say no. Faraj's 3D trophy is the model case: it becomes a "trophy display" feature that any league can turn on and fill with its own champions ([P5](P5-site-customization.md) section 6). This rule is what lets one small team maintain a product used by many leagues.

## 4. What we do not do

We supply software. We do not supply referees, gyms, insurance, equipment, medical cover or filming. We do not decide a league's rules or settle its disputes. When fees are paid online, the league is the seller and the money goes to the league's own payment account; we are not holding their money. These lines go in the terms of service so nobody assumes otherwise.

## 5. How we make money

**B-4 (changed November 12; the price itself is decided later): no published prices for now.** The founder's direction:

- Each league is quoted a price in a conversation. We start high and come down. Nothing goes on a public pricing page yet.
- The likely unit is **one price per league per season**, set by how long and how large the season is, not a monthly subscription.
- Money collected through us (registration fees, and sponsor payments if B-13 is agreed) may carry a platform fee. The rate is not decided.

My advice on this direction:

- Pricing by season fits how leagues think. They collect fees by season and budget by season.
- Quoting every league by hand works for roughly the first twenty leagues. Beyond that it is the bottleneck, and strangers who cannot see a price mostly leave. So a starting price must be chosen before sign-up opens to strangers ([T10](../technical/T10-build-order.md) stage 5).
- Until then the product needs very little for this: each league carries a record of what was agreed (price, term, any limits), and fair-use limits on email volume and storage protect us from abuse.

**B-5 (agreed): charge nothing until self-serve sign-up and online payments exist.** Faraj and the demo league are ours and stay free. We switch billing on at the stage where a stranger can sign up without us ([T10](../technical/T10-build-order.md) stage 5). Until then, pricing is a page in this spec, not code.

**What it costs us (estimate).** Hosting many small leagues on shared infrastructure costs roughly $100 to $200 a month in total at launch (database, servers, email, monitoring), rising slowly. One small league adds almost nothing. The real cost is support time, which is why setup must be something an organizer finishes alone.

## 6. Sports

**B-6 (agreed, changed November 12): basketball now, built so that any sport can be added.**

- We sell, test and support basketball leagues only for now. A basketball league gets every feature in full, including live stat tracking, as soon as its admin has set it up.
- Underneath, nothing assumes basketball. Registration, teams, schedules, scores, standings and the website do not care what sport is played. The parts that do (game format, the list of statistics, the live tracker) are packaged as a "sport definition", so adding a sport means adding one of those, not rewriting the product.
- We open a second sport when a real league asks for it. Each sport's tracker is built properly with its own rules; we do not relabel basketball buttons.

## 7. Getting the first customers

1. **Faraj League** moves onto the platform. It is the founder's own league and the showcase: a real league whose site looks custom.
2. **The TCSAAL demo.** Al-Hadi's real season is shown inside a demo league and presented to TCSAAL when the season ends. The ask is a pilot next season: one sport, or one district.
3. The next 5 to 10 small leagues come from the founder's own community and from Faraj players who run or play in other leagues. We set these up by hand, agree a price with each (B-4), and watch where they get stuck.
4. Sign-up opens to strangers. Only then do we spend any effort on marketing pages and search.
5. A TCSAAL pilot grows into the whole association once stage 6 exists and has been load-tested (F-5).

**B-7 (later, November 12): whether and when to spend on marketing or hire for sales is decided after a full season with Faraj or the demo league.** Until then nothing is spent on either. Every hour goes into the product and into watching real organizers use it, and selling is the founder talking to organizers directly (B-4). My recommendation when the time comes is still "not before 10 leagues run without our help".

## 8. Support

**B-8 (agreed):** help articles inside the admin, and support by email with a one-business-day reply target. No phone support. On game nights for the first leagues, the founder is reachable directly. Association customers get a named contact. We publish a status page.

## 9. How we know it is working

| Measure                                                    | Target for the first year (estimate) |
| ---------------------------------------------------------- | ------------------------------------ |
| Time from sign-up to a published league site               | Under 30 minutes without help        |
| Share of organizers who finish setup once they start       | Over 60%                             |
| Share of registrants who complete the form once they start | Over 85%                             |
| Games scored live that needed no correction by us          | Over 98%                             |
| Leagues that come back for a second season                 | Over 80%                             |
| Support requests per league per season                     | Under 3                              |

## 10. Things that need a professional, not an engineer

The founder agreed on November 12 to engage a lawyer and an accountant, after our own tests with Faraj and the demo league and before any stranger signs up. Everything to tell them and ask them is written out in the [brief for the lawyer and accountant](../LEGAL-BRIEF.md).

- **B-9 (agreed):** terms of service and privacy policy, written by a lawyer, before any stranger signs up.
- **B-10 (agreed):** children's data. TCSAAL and Al-Hadi involve students. The lawyer confirms our duties (in the United States: COPPA, and school-records rules where a school is the customer) before any youth league other than our own demo uses the product. Two things in the brief should not wait that long, because they exist during our tests: the school's written permission to show Al-Hadi's players publicly, and how the demo league uses TCSAAL's name (F-10).
- **B-11 (agreed):** payment terms and the tax treatment of what we charge, confirmed by an accountant before any money is taken.

## 11. Name

**B-12 (agreed for now, November 12): the working name is "SR Leagues".** It is a placeholder; the final name and domain come later. Wherever the product names itself (the footer mark in U-8, emails, our own pages) it says SR Leagues. This spec keeps writing `oursite.com` for the address, because no domain has been chosen or checked yet.

## 12. Sponsors

The founder's direction (November 12): every league can have its own sponsors, some leagues will let their teams have sponsors too, our own brand is always present, and we take a cut.

**B-13 (new, recommended; needs the founder's yes): showing sponsors is free, and our cut applies only to sponsor money that is paid through us.**

- We can only take a share of money that passes through us. Most small-league sponsorships are a handshake and a cheque. Charging for those cannot be enforced, and trying would push organizers to hide their sponsors or leave.
- So sponsor **display** is part of the product at no extra charge: league sponsors in tiers, division sponsors, and team sponsors where the league allows them ([P5](P5-site-customization.md) section 4).
- Our cut comes later, with payments (stage 5 or after): a league can sell sponsor packages on its own site. The sponsor pays online, the money goes to the league, and the platform fee comes out of it, exactly as with registration fees.
- Our own mark stays on every league's pages either way (U-8).
