// The numbers a public page leaves out, for a signed-in person allowed more (step 2.46): the
// address a page asks, and what its script does with the answer. Used only through this file.
export {
  staffNumbersAddress,
  staffNumbersParts,
  type StaffNumbersAsk,
} from './staff-numbers-address.ts';
export { StaffNumbersNote } from './staff-numbers-note.tsx';
export {
  browserReadStaffNumbers,
  staffNumbersReply,
  type ParsedMore,
  type ReadStaffNumbers,
  type StaffNotice,
  type StaffNumbersPage,
} from './staff-numbers-reply.ts';
export { useStaffNumbers } from './use-staff-numbers.ts';
