# 064 — The scoring screen has one look of its own, the same for every league

Date: 2026-11-15. Before step 2.35 opens; answers finding M10 of the audit of scoring a game live (step 2.107); narrows T5 §1 (T-90). Decided by the lead (technical and design). T-267.

## Problem

T-90 says every component is styled through the league's design values, turned into CSS variables once per page. The scoring screen was about to be built under that rule, and nothing said how it should look. The standard it is held to (the Al-Hadi tracker, `apps/live-stats/public/css/track.css`) is dark with fixed colors that each mean one thing, whatever the school's site looks like; Al-Hadi's own site is light. A league may save a pale panel color, a low-contrast accent, a display face with narrow figures, or have two teams in two shades of blue. Each of those is fine on a public page and wrong on a screen read at arm's length in a bright gym between plays.

## What

The scoring screen (`/{league}/score/{game}` and everything under `apps/web/src/features/tracker`) is styled by the product, not by the league:

- It reads none of the league's design variables (`--color-…`, `--font-…`, `--radius-…`, `--space`). Its own values are variables under one prefix, `--court-…`, set in the tracker's own stylesheet.
- It loads no font file: the device's own sans face, so the screen opens with no signal (step 2.38).
- The league appears as words: its name, the teams' names, the game's day and time. A team's color may show as a small mark beside its name where it can be told from the other team's; the two teams are told apart by light and dark, which the scorekeeper can swap (checklist D3).
- The rules of the look are [DESIGN.md](../../build/DESIGN.md), section 7 ("the courtside look"). The design lead who builds step 2.35 may change a value there with a reason; the rule that the league's values do not reach this screen is this record's.

The same exception already holds for sign-in, the account pages and SR Leagues' own pages (DESIGN.md section 4, line 24): T-90 is a rule for a league's site and its admin area.

## What else was considered

- **The league's design values, with a "contrast floor".** Rejected: a floor fixes contrast and not the rest (two teams alike, a narrow face, round pills too small to hit), and the scorekeeper's job is the same in every league, so there is nothing a league gains by it.
- **A dark and a light courtside look, chosen by the league or the device.** Not now: one look is one thing to make excellent and to test at four sizes. A light one for outdoor courts can be added as a second set of `--court-…` values without touching a component.
- **The Al-Hadi tracker's exact colors.** Its wine-dark page is Al-Hadi's maroon; the product's look belongs to no league, so the starting values are those with the wine taken out.

## Revisit if

A league asks for its own colors at the table and can say what it would gain; scorekeepers outdoors cannot read the dark screen; or the public "follow this game" page (which IS the league's, and stays under T-90) and the scoring screen drift so far apart that a scorekeeper cannot recognise the game they are scoring.
