// The people module (T2 §3). Other modules and packages use only what is here.
export {
  adultAge,
  isMinorOn,
  tickedButGrownOn,
  type MinorFacts,
  type MinorOrigin,
} from './rules/minor-by-age.ts';
export {
  defaultNamePolicy,
  nameForms,
  nameRequests,
  requestShowsLess,
  type NameForm,
  type NamePolicy,
  type NameRequest,
} from './rules/name-policy.ts';
export { personFieldNames, wrongPersonFields, type PersonFieldName } from './person-fields.ts';
export {
  findPrivateFields,
  privateValuesOf,
  type PrivateFieldFinding,
  type PrivateFieldScanOptions,
  type PrivatePersonFields,
} from './rules/private-field-scan.ts';
export {
  numberInPlace,
  showName,
  type PersonForDisplay,
  type ShownName,
  type WhereShown,
} from './rules/show-name.ts';
export {
  statsShown,
  statsVisibilities,
  type StatsShown,
  type StatsVisibility,
  type TeamStatsSetting,
} from './rules/stats-shown.ts';
export { publicViewer, signedInViewer, type Viewer } from './rules/viewer.ts';
export { createPerson, type CreatePersonError } from './commands/create-person.ts';
export { getPerson, type GetPersonError } from './commands/get-person.ts';
export { listPeople } from './commands/list-people.ts';
export { removePerson, type RemovePersonError } from './commands/remove-person.ts';
export {
  nameRequestReasons,
  setNameRequest,
  type NameRequestReason,
  type SetNameRequestError,
} from './commands/set-name-request.ts';
export { readNamePolicy, type NamePolicySettings } from './queries/read-name-policy.ts';
export { updatePerson, type UpdatePersonError } from './commands/update-person.ts';
export type {
  NewPerson,
  PeopleSearch,
  PeopleStore,
  PeopleTx,
  PersonChange,
  PersonRecord,
  PersonSensitiveFields,
} from './ports.ts';
export { changeOwnName, type ChangeOwnNameError } from './commands/change-own-name.ts';
export { giveOwnName, type GiveOwnNameError } from './commands/give-own-name.ts';
export type {
  OwnName,
  OwnNameContext,
  OwnNameDeps,
  OwnNameFieldError,
  OwnNameStore,
} from './own-name.ts';
