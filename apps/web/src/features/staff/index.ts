// The staff area's frame and the pieces its pages share (step 2.103): the admin's own
// header and menu, its home, the page of an area with no screen yet, "not found" inside
// the admin, and the trail, notice, pill and field every admin page is drawn with.
export { isReadyArea, isStaffAddress, staffPlaceAt, type StaffPlace } from './staff-area.ts';
export { StaffFrame } from './staff-frame.tsx';
export {
  StaffField,
  StaffNotice,
  StaffPill,
  StaffTrail,
  type NoticeKind,
  type PillKind,
} from './pieces.tsx';
export { AdminArea, StaffHome, StaffNotFound, StaffRefused } from './staff-pages.tsx';
