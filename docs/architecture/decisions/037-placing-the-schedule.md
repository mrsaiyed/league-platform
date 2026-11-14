# 037 — Placing the schedule: strict rules are never broken, the rest is done as well as it can be

Date: 2026-11-13. Step 2.73; serves P7 §4.1 and §4.2, S-3, T-182. Decided by the lead (technical). T-249.

## Problem

P7 §4 lets an admin switch fairness rules on (no team twice in one day, early and late slots spread evenly, home and away balanced, no same matchup two weeks running) and give team requests ("cannot play on October 12"). Every rule can be met on its own, but not always all together in a season of a given length, with a given number of courts, once the admin has locked some games. The specification did not say what the placer does then: refuse to make a schedule, break a rule quietly, or give back something partial and say so.

## What

- **Two kinds of rule.** Some are strict: a game the placer puts down never breaks them. They are no team twice in one day, no same matchup in two weeks running, keeping games within a division, and team requests (always on), and besides these a placed game never clashes (a team in two places, a court booked twice, a skipped date). The others are best effort: spreading early and late slots and balancing home and away are done as well as the season allows, and the fairness report says where they fall short.
- **Unplaced games are returned, not forced.** A game that fits nowhere in the season without breaking a strict rule comes back in `unplaced`, next to the schedule. The placer tries the game's own week first, then the earliest week where it fits, using spare weeks at the end of the season. The admin adds the game by hand, or changes the inputs (more dates, more courts, fewer requests) and generates again. The fairness report counts the pair as meeting too few times, so the shortfall is visible in the same place as every other.
- **Locked games are the admin's.** They stay exactly where they are, even when they break a rule, and the rest is placed around them. They are the one way a strict rule can be broken, and it is the admin's own doing.
- **Repeatable.** The same inputs give the same schedule. Variety comes only from the `arrangement` number the caller passes, never from a clock or a random source.
- **Checked with generated inputs (T-182).** Tests build many seasons from a seeded generator and check that no schedule breaks a strict rule, that nothing clashes, that every game is either placed or listed as unplaced, and that locked games stay put.
- **Regenerating replaces every game that is not locked.** That includes games that already have a result, are live or were forfeited. Step 2.74 must therefore lock every game that is not still plain "scheduled", or refuse to regenerate while any game has a result. Locked games that are cancelled or postponed still stand for one game of the pairings (the placer does not place that pair again) and are not put on a new date, because the admin locked them.
- **Known gap: the clean-up pass does not retry.** After placing, the fairness report and clash check take out any placed game that still breaks a strict rule, and it goes to `unplaced`. It is not tried again in another slot or week. This only happens when locked games break a rule, since the placing itself avoids them, so the admin sees it in the unplaced list and can add the game by hand. A retry can be added later without changing the result's shape.
- **Inputs are checked.** The `arrangement` number must be a whole number, 0 or more (`invalid-arrangement`). A round kept from the old schedule that holds no locked game takes the date of its first new game.

## Considered

- **Refusing when a strict rule cannot be met everywhere.** The admin would get nothing, not even the games that fit, and would have to guess which input to change. A partial schedule with the unplaced list shows exactly what is missing.
- **Breaking a strict rule to place every game.** A schedule that quietly puts a team in two games on one day is wrong in a way a league finds out on the day. A visible gap is better than a hidden fault.
- **Making every rule strict.** Even spreading and home and away balance cannot always be reached when games are locked or unplaced, so a strict version would leave games out for reasons that matter much less than a team playing twice in a day.
- **Searching until the best schedule is found.** It would be slow and could differ between runs of the same inputs. A short, fixed search that is allowed to stop short, with the report saying so, keeps results quick and repeatable.

## Revisit if

Admins want a rule moved between strict and best effort (it would become a setting of the season's rules), a league's real seasons often leave games unplaced so that a smarter search is worth its cost, or generation grows slow enough that it needs a time limit.
