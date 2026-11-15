// The answers to `npm run league:remove`'s questions (step 2.150, record 063). Only the
// spaces a terminal leaves around a typed line are taken off, as the maker's question
// does; what is left must then be exactly what was asked for, capitals included (the
// twin's hosted rule, answerGoesAhead). The command and the database compare it again
// and trim nothing.
import { answerGoesAhead } from './make-league-source.mjs';

/** What goes to the command, or null when the answer is not the short name. */
export function typedShortName(answer, slug) {
  const typed = answer.trim();
  return answerGoesAhead(typed, { hosted: true, slug }) ? typed : null;
}

/**
 * The owner's email, asked as well when the owner has signed in (area 5 review, M3):
 * compared the same way as the short name. What goes to the command, or null.
 */
export function typedOwnerEmail(answer, email) {
  const typed = answer.trim();
  return answerGoesAhead(typed, { hosted: true, slug: email }) ? typed : null;
}
