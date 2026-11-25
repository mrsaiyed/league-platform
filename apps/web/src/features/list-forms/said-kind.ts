// What a line beside the thing says (said-line.tsx): saved, removed, or a change not made
// (the games area: a game called off meanwhile, step 2.221). A change not made is an alert,
// read out at once; the others are a status.

export type SaidKind = 'saved' | 'removed' | 'error';

export function saidRole(kind: SaidKind): 'alert' | 'status' {
  return kind === 'error' ? 'alert' : 'status';
}
