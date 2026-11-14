// A Teams form's text fields turned into a command's input (step 2.51). Nothing here
// decides whether the input is right: the command checks it and refuses what is not
// (shortNameNeeded only picks clearer words for one case the command would refuse).
// A field left empty becomes "not given" (or "none", where the command takes null).
export type Fields = Readonly<Record<string, string>>;

const text = (fields: Fields, name: string): string => (fields[name] ?? '').trim();
const given = (fields: Fields, name: string): string | undefined => {
  const value = text(fields, name);
  return value === '' ? undefined : value;
};

/** The version the person was looking at (T-46); NaN when missing, which the command refuses. */
const versionOf = (fields: Fields): number => Number(text(fields, 'version'));

/** A short name made from a name when none is typed: `Blue Jays!` becomes `blue-jays`. */
export function shortNameFrom(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * True when a name was typed but no short name could be made from it (a name in
 * Arabic letters, say) and none was typed: the admin is asked for one, rather than
 * told only that something is not valid.
 */
export function shortNameNeeded(input: { readonly name: string; readonly shortName: string }) {
  return input.name !== '' && input.shortName === '';
}

export function newTeamInput(fields: Fields, seasonId: string) {
  const name = text(fields, 'name');
  const color = fields['useOwnColors'] === undefined ? given(fields, 'color') : undefined;
  const divisionId = given(fields, 'divisionId');
  const statsVisibility = given(fields, 'statsVisibility');
  return {
    seasonId,
    name,
    shortName: given(fields, 'shortName') ?? shortNameFrom(name),
    ...(color === undefined ? {} : { color }),
    ...(divisionId === undefined ? {} : { divisionId }),
    ...(statsVisibility === undefined ? {} : { statsVisibility }),
  };
}

export function changeTeamInput(fields: Fields) {
  const name = text(fields, 'name');
  return {
    teamId: text(fields, 'team'),
    version: versionOf(fields),
    name,
    shortName: given(fields, 'shortName') ?? shortNameFrom(name),
    // null puts the league's own colors back; a division left empty takes the team out of it.
    color: fields['useOwnColors'] === undefined ? (given(fields, 'color') ?? null) : null,
    divisionId: given(fields, 'divisionId') ?? null,
  };
}

export function teamStatsInput(fields: Fields) {
  return {
    teamId: text(fields, 'team'),
    version: versionOf(fields),
    statsVisibility: text(fields, 'statsVisibility'),
  };
}

export function addToRosterInput(fields: Fields, personId: string) {
  const jerseyNumber = given(fields, 'jerseyNumber');
  return {
    teamId: text(fields, 'team'),
    personId,
    ...(jerseyNumber === undefined ? {} : { jerseyNumber }),
    role: given(fields, 'role') ?? 'player',
  };
}

export function newPersonInput(fields: Fields) {
  return { firstName: text(fields, 'firstName'), lastName: text(fields, 'lastName') };
}

export function changeEntryInput(fields: Fields) {
  return {
    rosterEntryId: text(fields, 'entry'),
    version: versionOf(fields),
    // Empty takes the number away.
    jerseyNumber: given(fields, 'jerseyNumber') ?? null,
    role: given(fields, 'role') ?? 'player',
  };
}

/**
 * The leaving date is always typed by the admin (the field is required): the server
 * does not guess "today", because its clock is UTC and the league has no time zone
 * here yet, so a guess could be a day off.
 */
export function markLeftInput(fields: Fields) {
  return {
    rosterEntryId: text(fields, 'entry'),
    version: versionOf(fields),
    leftOn: text(fields, 'leftOn'),
  };
}

/**
 * The roster's order after moving one entry a place up or down: the ids of everyone
 * still on the roster, in the new order. Moving the first up or the last down changes
 * nothing.
 */
export function movedOrder(
  openIds: readonly string[],
  entryId: string,
  direction: 'up' | 'down',
): readonly string[] {
  const at = openIds.indexOf(entryId);
  const to = direction === 'up' ? at - 1 : at + 1;
  if (at === -1 || to < 0 || to >= openIds.length) return openIds;
  const next = [...openIds];
  const [moved] = next.splice(at, 1);
  if (moved === undefined) return openIds;
  next.splice(to, 0, moved);
  return next;
}
