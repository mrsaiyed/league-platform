// A name put just before a sentence's own full stop (step 2.155 part 5): a name that ends in
// one already, "St. Louis Jr.", gives that stop to the sentence, so the answer reads
// "Brought back: St. Louis Jr." and never "Jr..". A name ending in "..." keeps its three.

/** The name with its one last full stop dropped, for a template that puts its own after it. */
export function nameBeforeStop(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}
