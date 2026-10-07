# GitHub upload and sharing

## Current state

The repository is prepared locally. No GitHub repository or hosted URL has been created by this task. This session had no connected GitHub tool, and Windows denied access to saved Git credentials. Authentication must be completed in the owner's normal GitHub session.

## Upload the source

1. Sign in to GitHub and create a new repository named `league-platform` (or your preferred available name). Start **private** unless you intentionally want to disclose the source. Do not initialize it with a README, license, or `.gitignore`; this local repository already contains those decisions/files where appropriate.
2. Copy the new repository's HTTPS URL.
3. Open a terminal in this `league-platform` folder and run the following, replacing the URL with the exact one GitHub showed:

```sh
git remote add origin https://github.com/YOUR-USERNAME/league-platform.git
git push -u origin main
```

4. Complete the Git Credential Manager browser sign-in if prompted. Do not paste access tokens into chat or commit them to a file. If an `origin` already exists, inspect `git remote -v` and deliberately set the correct URL rather than adding a second remote.
5. Check the CI result in Actions. In repository settings, enable branch protection/rulesets with the CI job required and pull-request review before merging. Those GitHub-side protections are recommendations, not already enabled by a local commit.

The initial repository has already been initialized and committed; do not run another `git init` or create an unrelated first history.

## Let other people open the concept

**Immediate offline option:** Send `dist/Al-Hadi League Demo.html`. Recipients download it and open it in a current Chrome or Edge browser. No Node, server, account, or internet connection is required for the presentation. Some mail systems block HTML attachments; use an approved file-sharing service or ZIP if that happens.

**Web link option:** The static site is `dist/demo/`, generated with `npm run build:demo`. The repository contains a manual GitHub Pages workflow:

1. In repository Settings → Pages, choose GitHub Actions as the build/deployment source.
2. Check what visibility/access your repository and GitHub plan support. Do not change the source repository to public merely to bypass an unavailable setting without intentionally approving that disclosure.
3. In Actions, run **Publish concept demo** manually. This deploys only the static fictional example, not documentation or a production backend.
4. Use the URL reported by the deployment. Verify it from another browser before sending it to the principal.

The Pages workflow does not run automatically on source pushes. Sharing a repository link lets someone inspect code; it is not the same as a working website URL. The demo's commissioner and player views remain accessible to everyone who can open the hosted concept because they are presentation personas, not secured accounts.

[GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
