# 059 — The designs' faces, served from our own address

Date: 2026-11-14. Step 2.147 (part 1); answers the 2.105 audit's finding L3 and the finding of step 2.85's code review that no font file was anywhere in the product; serves T5 §1 (T-90), C-16, U-8. Decided by the lead (a technical decision, T-262; drafted by the design lead and confirmed by the lead after the code review of part 1). Corrected the same day after that review: what moves on a page while a face arrives (below), and a note for step 2.98.

## Problem

T5 §1 says a league's fonts "come from a fixed list we host ourselves". The list existed (`packages/site/src/design/fonts.ts`) and every design named two of its faces, but the product held no font file and no rule that loads one. A page named "Cinzel" and the reader saw whatever the device had: Palatino on one laptop, Georgia on another, the system's sans on a phone. The look was left to the device, and step 2.147's first starting design is built on a serif display face that most devices do not have.

Three ways the files could come in were weighed:

1. **Ask a font service for them when the page is read** (a stylesheet from another site). Refused: a visitor's address would go to another company on every page of every league (the product promises not to do that, and a youth league's visitors are children and their parents), the page would wait on a second site, and the look would change if that site changed.
2. **Fetch them when the product is built** (as Next.js's own font helper does). Refused: the build would need the network and another site's good health, the same commit could build differently on two days, and the gate on this computer and on GitHub's machines would no longer be the same.
3. **Take them as dependencies: packages that carry the files**, pinned to one exact version each, installed with everything else and checked by the same lock file. Chosen.

## What

**The files come from the `@fontsource-variable` packages**, one for each face of the list, added to the web app's dependencies at one exact version (no range), so `package-lock.json` records each file's package by its checksum:

| Key in a design     | Face              | Package                                  | Version | Licence |
| ------------------- | ----------------- | ---------------------------------------- | ------- | ------- |
| `gelasio`           | Gelasio           | `@fontsource-variable/gelasio`           | 5.3.0   | OFL 1.1 |
| `cinzel`            | Cinzel            | `@fontsource-variable/cinzel`            | 5.3.0   | OFL 1.1 |
| `jost`              | Jost              | `@fontsource-variable/jost`              | 5.3.0   | OFL 1.1 |
| `inter`             | Inter             | `@fontsource-variable/inter`             | 5.3.0   | OFL 1.1 |
| `playfair-display`  | Playfair Display  | `@fontsource-variable/playfair-display`  | 5.3.0   | OFL 1.1 |
| `source-sans`       | Source Sans 3     | `@fontsource-variable/source-sans-3`     | 5.3.1   | OFL 1.1 |
| `oswald`            | Oswald            | `@fontsource-variable/oswald`            | 5.3.0   | OFL 1.1 |
| `noto-naskh-arabic` | Noto Naskh Arabic | `@fontsource-variable/noto-naskh-arabic` | 5.3.0   | OFL 1.1 |

**Gelasio is new in the list**: the serif display face of the first starting design (titles, team names, scores and big numbers). It was chosen because it is drawn to the widths of Georgia, the face the first Al-Hadi demo was set in, so on a device that has Georgia a title keeps its line breaks when Gelasio takes over; and because it carries both old-style figures (its own, used for a big number that stands alone) and lining, even-width figures (used for every score).

**Each is the variable cut of its face**: one file holds every weight, so a design may use any weight without another download. The packages name the family with "Variable" after its own name ("Gelasio Variable"), and `fontFamilies` in `fonts.ts` holds those names; a design still stores only the key.

**The licence** of every one of the eight is the SIL Open Font License, version 1.1, which each package states in its `package.json` and carries in full in its `LICENSE` file. It allows a face to be used, bundled and served with a product, free of charge, as long as the face is not sold by itself and its licence travels with it. We serve the files exactly as the packages carry them and change none (the licence lets a face reserve its name for unchanged copies, and Playfair Display's does); the licence texts stay in the packages, which are part of every install. Nothing is owed and nobody is signed up to anything. This is the design lead's reading of a short, widely used licence, not a lawyer's: if the founder ever has the product's licences looked over, these eight belong on that list.

**The web app links them once.** `apps/web/src/app/font-faces.css` is eight `@import` lines, one per package, and the root layout loads it, so the rules reach every page: a league's pages, SR Leagues' own and the standalone ones. The build copies the files beside the app's other static files, under its own address, with names made from their contents, so a browser keeps them for good. No page asks another site for a font, when it is read or when the product is built.

**Nothing holds up the page, and so the page can move a little, once.** Every rule says `font-display: swap`: text is drawn at once in the next face of its list and redrawn when its own arrives. The two are not the same width, so on a first visit a line can break in another place and what is under it shift by a line when the face arrives. An earlier wording of this record said nothing moves in the first starting design; that was wrong. Gelasio matches Georgia's widths, but a phone that has no Georgia draws another serif first; the reading face (Source Sans 3) is narrower than the sans a device draws first; and the other designs' faces (Cinzel, Oswald) are far from anything a device has. After the first visit the files are kept by the browser and the faces are there from the start. Every rule also names the range of letters its file covers, so a browser downloads a file only when the page draws a letter from it in that face: a league set in two faces downloads those two, for the scripts on the page (25 to 50 KB each for Latin letters), not the eight. Each face's list in `fonts.ts` still ends in faces a phone or a laptop already has that keep its character, which is what a reader sees for that first moment and what a script the face has no letters for falls back to.

**Scores are set only in a face with lining, even-width figures** (`evenFigureFonts`, `scoreFont`, the variable `--font-score`): two scores side by side are compared digit by digit. Measured in a browser from the files we serve: Gelasio, Source Sans 3, Inter and Jost have them; Cinzel, Playfair Display and Oswald do not, so a design whose heading face is one of those has its scores in its body face.

**How a heading face is set belongs to the face**, not to a league or to "dark or light": `headingTraits` in `fonts.ts` gives each face its weights, the distance between its letters, and whether a hero's title and the league's name are in capitals. The frame's variables are worked out from them (`frame-look.ts`).

## Adding a face later

Add the package at an exact version; add its key, family name, fallback list and traits to `fonts.ts`; add its `@import` to `font-faces.css`. `font-faces.test.ts` fails until the three agree. P5 §2 plans a curated list of about 30 faces: each must be under an open licence that allows serving it, checked the same way, and measured for its figures before it is added to `evenFigureFonts`.

## Not done here

- **A page does not yet tell the browser ahead of time which faces it will need** (a preload hint for the league's two faces). The files' names are made by the build, so the hint must come from the build's own list of them; without it the faces arrive a moment after the text. Left for the step that measures page speed (T8).
- **The first face drawn is not yet fitted to the one that replaces it.** A stylesheet can name a stand-in face made from one the device has, stretched to the real face's widths and heights (`size-adjust`, `ascent-override` and their kin), so that nothing moves when the real one arrives. It was weighed after the code review and is not small: each of the eight faces needs its own measured numbers against each face a device may draw first (Georgia and the serif of a phone without it, the system sans of each kind of device), in a browser, with a check that fails when a package's new version changes them. Left for the same page-speed step (T8), which measures how much a page moves and can prove the numbers; until then the cost is one small shift on a first visit.

## For step 2.98 (the browser's rules for what a page may load)

- **Fonts** come from our own address and nowhere else: the rule for fonts can be `'self'`.
- **The small icons of the shared pieces are `data:` pictures written in the stylesheet.** The arrow after a way on, the pin before a place and the like are SVG drawings held in variables of `packages/ui` (`--ui-arrow`, `--ui-pin`) as `data:image/svg+xml` addresses and drawn as masks. A browser treats a mask as an image, so a rule for images that does not allow `data:` would remove every one of them without an error anyone sees. Step 2.98 either allows `data:` for images or first moves these drawings to files served from our own address.
- **The design's variables are one `<style>` block written into each league page** (T-90), and pieces set a few variables in `style` attributes (a team's color, the letters a scoreboard counts). A rule for styles has to allow both, or they have to be moved first.
- **The Al-Hadi tracker** (`apps/live-stats`) is not touched and uses the device's own faces, as before.
- **Font uploads** by a league are not offered (P5 §2: "No font uploads at first").

## Checks

`apps/web/src/app/font-faces.test.ts`: one package is linked for each face a design can name and for nothing else; the first name in each face's list is the name the package's rules give it; every file a rule names is in the package beside the rules, a `.woff2` file, and no rule names another site; every rule says `font-display: swap` and a range of letters; every package states OFL-1.1 and carries the licence's text; every package is pinned to one exact version. `packages/site/src/design/derived-values.test.ts`: every face has its traits, and a score is only ever set in a face with even-width figures. In a browser, on the built app: the pictures of `scripts/shots.mjs` wait for `document.fonts.ready`, and show Gelasio, Source Sans 3, Cinzel, Jost and Inter drawn on the made-up leagues' pages.
