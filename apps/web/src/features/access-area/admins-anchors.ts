// The places on the Admins page a change lands at with scripts off (`#…`), and where its
// "Saved" notice is said (step 2.97, record 067).
export const adminsAnchors = {
  invite: 'invite',
  people: 'people',
  invitations: 'invitations',
  invitation: (invitationId: string) => `invitation-${invitationId}`,
} as const;
