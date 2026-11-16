// Which interface messages a lane added or changed in the one English file there was before
// step 2.188 (packages/site/src/messages/en.ts, one object), and whether each is in the
// joined messages now with the same text. Kept apart from scripts/check-lane-messages.mjs,
// which asks git and imports the joined messages, so it can be tested by itself
// (tests/check-lane-messages.test.mjs).
//
// When a lane that added keys to the old file is merged with the build branch after the
// split, the keys must be moved by hand into the area files; a key looked up only by a name
// built at run time (`adminSettings.area.${area}`) has no type error if it is lost, so this
// check is what notices.

/** The single object of an old en.ts, from its text: { key: text }. Throws if it is not one. */
export function oldCatalog(text, label = 'en.ts') {
  if (!/^export const en = \{$/m.test(text) || /^\s*\.\.\.en[A-Z]/m.test(text)) {
    throw new Error(
      `${label} is not the one-object file of before step 2.188 (it may already be the joined index).`,
    );
  }
  const body = text
    .replace(/^export type MessageKey = keyof typeof en;\s*$/m, '')
    .replace(/^export const en = \{$/m, 'return {')
    .replace(/^\} as const;$/m, '};');
  // The file is data only: string keys and string texts, with comments.
  return new Function(body)();
}

/** The keys the lane added or changed against the base: [key, the lane's text]. */
export function laneChanges(base, lane) {
  return Object.entries(lane).filter(([key, text]) => base[key] !== text);
}

/**
 * What is wrong in the joined messages for those keys: one sentence each ([] when nothing).
 */
export function laneMessageProblems(changes, joined) {
  const problems = [];
  for (const [key, text] of changes) {
    if (!Object.hasOwn(joined, key))
      problems.push(`missing: ${key} (the lane's text: ${JSON.stringify(text)})`);
    else if (joined[key] !== text) {
      problems.push(
        `different: ${key}: the lane's text ${JSON.stringify(text)}, the joined messages' ${JSON.stringify(joined[key])}`,
      );
    }
  }
  return problems;
}
