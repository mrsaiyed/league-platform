// The note above the numbers a signed-in coach, captain or admin sees beyond the public's
// (step 2.46): they are not public, and whose they are. Its words come with the answer, from
// the message files on the server (T-187).
import type { StaffNotice } from './staff-numbers-reply.ts';

export function StaffNumbersNote({ notice }: { readonly notice: StaffNotice }) {
  return (
    <div className="staff-numbers-note" role="note">
      <p className="staff-numbers-note-title">{notice.title}</p>
      <p>{notice.text}</p>
    </div>
  );
}
