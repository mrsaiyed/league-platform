// The answer to `npm run league:remove`'s question (step 2.150, record 063). Only the
// spaces a terminal leaves around a typed line are taken off, as the maker's question
// does; what is left must then be the league's short name exactly, capitals included
// (the twin's hosted rule, answerGoesAhead). The command and the database compare it
// again and trim nothing.
import { answerGoesAhead } from './make-league-source.mjs';

/** What goes to the command, or null when the answer is not the short name. */
export function typedShortName(answer, slug) {
  const typed = answer.trim();
  return answerGoesAhead(typed, { hosted: true, slug }) ? typed : null;
}
