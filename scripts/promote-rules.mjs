// The rules that decide whether GitHub's `main` may move. They are kept apart from
// scripts/promote-to-main.mjs, which talks to git and GitHub, so they can be tested by
// themselves (tests/promote-rules.test.mjs).

// The workflow that publishes the live tracker site.
export const publishWorkflow = '.github/workflows/demo-pages.yml';

const unix = (text) => text.replace(/\r\n/g, '\n');
const short = (commit) => commit.slice(0, 7);

// A workflow reaches the live tracker when it is the publish workflow, when it can publish
// the Pages site, or when it uses the live database's address or key.
const reach =
  /deploy-pages|upload-pages-artifact|pages:\s*write|gh-pages|SUPABASE_URL|SUPABASE_ANON_KEY/;
export const reachesLiveSite = (file, text) => file === publishWorkflow || reach.test(text);

// The one commit the publish workflow builds the live site from. Empty when it does not
// check out exactly once, at one full commit id.
export function pinnedCommit(workflow) {
  const text = unix(workflow);
  const checkouts = text.match(/uses:[ \t]*actions\/checkout@/g) ?? [];
  const refs = text.match(/^[ \t]*ref:/gm) ?? [];
  const pinned = text.match(
    /uses:[ \t]*actions\/checkout@\S+[ \t]*\n(?:[ \t]*#[^\n]*\n)*[ \t]*with:[ \t]*\n(?:[ \t]*#[^\n]*\n)*[ \t]*ref:[ \t]*([0-9a-f]{40})[ \t]*\n/,
  );
  return checkouts.length === 1 && refs.length === 1 && pinned ? pinned[1] : '';
}

// True when a push to main starts the publish workflow only if that workflow file changed.
export function runsOnlyOnItsOwnChange(workflow) {
  return unix(workflow).includes(
    "\non:\n  push:\n    branches: [main]\n    paths: ['.github/workflows/demo-pages.yml']\n  workflow_dispatch:\npermissions:\n",
  );
}

// What to do with the newest checked commit.
//   before, after: the workflows that reach the live tracker, as { file: text }, on main
//                  and at the commit.
//   pinInBranch:   the commit the publish workflow names is part of the build branch.
//   releaseArg:    what --release-tracker= was given, or ''.
//   gameNear:      the start time of a game too close to release around, or ''.
// Returns { refuse: why }, or { move: 'ordinary' | 'release', pin, from, changed }.
export function decideMove({ before, after, pinInBranch, releaseArg, gameNear }) {
  const files = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changed = files.filter((file) => before[file] !== after[file]);
  const publish = after[publishWorkflow] ?? '';
  const pin = pinnedCommit(publish);
  if (!pin || !runsOnlyOnItsOwnChange(publish)) {
    return {
      refuse:
        'the publish workflow at that commit does not build the live tracker from one fixed commit, so moving main would republish it.',
    };
  }
  if (!pinInBranch) {
    return {
      refuse: `the publish workflow names commit ${short(pin)}, which is not part of the build branch.`,
    };
  }
  const from = pinnedCommit(before[publishWorkflow] ?? '');
  if (!releaseArg) {
    if (changed.length > 0) {
      return {
        refuse: `it would change what reaches the live tracker (${changed.slice(0, 3).join(', ')}). That is a release of the tracker: only the lead makes one, in a session the founder started.`,
      };
    }
    return { move: 'ordinary', pin, from, changed };
  }
  if (changed.length === 0) {
    return {
      refuse:
        'nothing that reaches the live tracker differs from main, so there is nothing to release. Run it without --release-tracker.',
    };
  }
  if (releaseArg.length < 7 || !pin.startsWith(releaseArg)) {
    return {
      refuse: `--release-tracker says ${releaseArg}, but the publish workflow names ${short(pin)}.`,
    };
  }
  if (gameNear) {
    return {
      refuse: `a game starts at ${gameNear}. The live tracker is never released around games.`,
    };
  }
  return { move: 'release', pin, from, changed };
}
