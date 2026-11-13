// The fixed numbers and words of access (T-226). Product rules live here as data.

/** An invitation's link works for this long after it is sent or re-sent (T-226). */
export const invitationLifetimeDays = 14;

/**
 * The job that emails an invitation (T7 §2), with the invitation's id only; the
 * worker makes the link as it sends (issueInvitationLink).
 */
export const invitationEmailJob = 'email.send';

export const invitationStatuses = ['pending', 'expired', 'accepted', 'cancelled'] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

/**
 * U-9: archived and suspended leagues are read-only. No one is invited into them or
 * joins them; cancelling an invitation and removing access always work. The same
 * states as the leagues module's readOnlyStatuses (a test checks they agree).
 */
export const readOnlyLeagueStatuses: readonly string[] = ['archived', 'suspended'];

/** The most activity entries one read returns. */
export const activityPageLimit = 100;
