// A whole name typed into the first-name box (step 2.146): "Sam Rivera" as the first name,
// with the last name empty or the same word again. Asked before saving, never refused: some
// first names are two words ("Mary Ann"), so a tick under the question saves it as typed.

/** Whether the first name looks like a whole name, given what the last-name box holds. */
export function wholeNameInFirst(firstName: string, lastName: string): boolean {
  const words = firstName.trim().split(/\s+/u);
  if (words.length < 2) return false;
  const last = lastName.trim().toLocaleLowerCase();
  return last === '' || words.at(-1)?.toLocaleLowerCase() === last;
}
