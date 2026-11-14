// The people module (T2 §3). Other modules and packages use only what is here.
export {
  childNameForms,
  defaultNamePolicy,
  nameRequests,
  type ChildNameForm,
  type NamePolicy,
  type NameRequest,
} from './rules/name-policy.ts';
export {
  findPrivateFields,
  privateValuesOf,
  type PrivateFieldFinding,
  type PrivateFieldScanOptions,
  type PrivatePersonFields,
} from './rules/private-field-scan.ts';
export {
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
export { publicViewer, type Viewer } from './rules/viewer.ts';
export { createPerson, type CreatePersonError } from './commands/create-person.ts';
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
