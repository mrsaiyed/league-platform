# GitHub and sharing

## Current setup

- Source: <https://github.com/mrsaiyed/league-platform>, branch `main`.
- Live stats: <https://mrsaiyed.github.io/league-platform/>, published by the **Publish site** workflow on every push to `main`.
- Concept: <https://mrsaiyed.github.io/league-platform/demo/>.
- The owner configured the repository as public and enabled GitHub Pages. Preserve those settings unless the owner requests otherwise.
- GitHub Actions verifies pushes and pull requests. Every push to `main` publishes the site; **Publish site** can also be run by hand from the Actions tab.

## Publish an update

1. Run `npm run verify` and the browser checks locally.
2. Commit and push to `main`. **Publish site** runs by itself; check it and **Verify** in GitHub Actions.
3. Wait for success and check the hosted site reflects the update.

`dist/pages/` is published: the live stats at the root (`npm run build:pages`) and the concept demo under `demo/`. The concept contains fictional records plus founder-supplied AHS photography. Commissioner and personal-player views are presentation personas accessible to everyone who opens the concept. Do not enter private student records.

## Offline presentation and screenshots

`npm run build:demo` creates `dist/Al-Hadi League Demo.html`, which opens in current Chrome or Edge without a server. `npm run capture:presentation` exports screenshots under `artifacts/principal-screenshots/`. See the [principal review](../presentation/principal-review.md).

Generated builds and screenshots are not committed. Change the source example, then rebuild. Never put credentials in files, chat, or remote URLs.

Branch protection and required reviews have not been configured by this task. Configure those when the team agrees on its contribution process.
