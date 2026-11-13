// The fixed numbers and words of access (T-226). Product rules live here as data.

/** An invitation's link works for this long after it is sent or re-sent (T-226). */
export const invitationLifetimeDays = 14;

/** The job that emails an invitation's link (step 1.19 sends it). */
export const sendInvitationJob = 'access.send_invitation';

export const invitationStatuses = ['pending', 'expired', 'accepted', 'cancelled'] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

/** The most activity entries one read returns. */
export const activityPageLimit = 100;
