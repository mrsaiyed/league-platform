# GitHub and sharing

## Current setup

- Source: <https://github.com/mrsaiyed/league-platform>, branch `main`.
- Concept: <https://mrsaiyed.github.io/league-platform/>.
- The owner configured the repository as public and enabled GitHub Pages. Preserve those settings unless the owner requests otherwise.
- GitHub Actions verifies pushes and pull requests. The Pages workflow is manually dispatched; pushing by itself does not publish.

## Publish an update

1. Run `npm run verify` and `npm run test:browser` locally.
2. Commit and push. Check **Verify** in GitHub Actions.
3. Run **Publish concept demo** from Actions with branch `main`.
4. Wait for success and verify the hosted site reflects the update.

Only `dist/demo/` is published. The site contains fictional records plus founder-supplied AHS photography. Commissioner and personal-player views are presentation personas accessible to everyone who opens the concept. Do not enter private student records.

## Offline presentation and screenshots

`npm run build:demo` creates `dist/Al-Hadi League Demo.html`, which opens in current Chrome or Edge without a server. `npm run capture:presentation` exports screenshots under `artifacts/principal-screenshots/`. See the [principal review](../presentation/principal-review.md).

Generated builds and screenshots are not committed. Change the source example, then rebuild. Never put credentials in files, chat, or remote URLs.

Branch protection and required reviews have not been configured by this task. Configure those when the team agrees on its contribution process.
