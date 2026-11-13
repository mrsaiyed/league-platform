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
