# 071 — Page titles are never streamed

Date: 2026-11-16. Step 2.175 (T-275). Serves T-186 (WCAG 2.2 AA), T8 section 8, T9 section 6. Decided by the lead; built by the builder of step 2.175.

## Problem

Browser checks failed by chance on "the page has no title", with the page's main area and its one heading already drawn. Next.js (16.4) sends a page's metadata, its title among it, in the page's head only to the few bots on its own list. For a browser it streams it: when the metadata is not ready by the time the page starts to be sent, the page's content arrives first and the title follows later, at the end of the body. Shown on purpose with a title made 400 ms slow in a test build: the raw HTML of the home page, a league's pages, the account page and the box score had the title after the head in 20 requests of 20, and a page sat for about 370 ms with its heading and no title. A person's browser or screen reader could meet a page with no title in that time.

## What

- **Page titles and all other page metadata are never streamed.** `apps/web/next.config.ts` sets `htmlLimitedBots: /.*/`, the way the framework's own documentation gives to switch streaming metadata off ("To fully disable streaming metadata", `node_modules/next/dist/docs`, htmlLimitedBots): every request that names a browser is treated as one that gets its metadata in the head.
- **So the first byte of every page waits for its metadata.** `generateMetadata` must never read slow data. Today no page has one: the only metadata is the static title in the root layout, a word from the message files. If a page ever needs data for its title, it reads it through the same cached read the page itself uses, so the title costs no second trip.
- **A request that names no browser at all** (no user agent) still gets the title late, by the framework's own rule. That is accepted: every browser names itself.
- **Pinned by tests that cannot pass by chance:** `apps/web/next-config.test.ts` asks Next.js's own `shouldServeStreamingMetadata` about current Chrome, Safari on an iPhone, Firefox and Edge with the setting as the server holds it, and fails if the setting is removed. The browser tests also read the raw HTML of the home page, league pages, the account page and a page drawn again after a refused save, with scripts off, for a title in the head.

## Considered

- **Leaving streaming on and making the tests wait for the title.** The tests would pass, and a person could still meet a page with no title.
- **A list of known browsers instead of every agent.** Any browser not on it, or a new one, would get its title late again; every request is simpler and is what the documentation gives.
- **Moving the title into each page's own markup by hand.** The framework already writes the title; two ways of writing it would disagree.

## Revisit if

- **Cache Components or partial prerendering is ever turned on.** The framework then skips the prerendered shell for every request it treats as a limited bot (so that blocking metadata can be in the head), and with this setting that is every request: the prerendered shell would never be served. The choice between streaming and that cost is then made again.
- A page needs metadata that is slow to read and cannot be cached: its first byte would wait for it.
- The framework changes how it sends metadata, or the option's meaning (the test above fails if the option stops naming a browser).
