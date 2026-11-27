// Whom a try is counted with (T-225, T-504), shared by every adapter so the local
// stand-in and the Supabase adapter count alike. A stranger's tries are counted against
// the address typed and the network they come from. A device the app vouches for (its
// signed cookie says this device has signed in to this address before, T-505) is
// counted on its own: its wrong passwords and its asks for a code never use up the
// address's or the network's allowance, and no stranger's use up its own. It is trusted
// for nothing more: its own tries meet the same numbers as anyone's. Wrong codes are
// counted apart from wrong passwords (T-506), so a flood of wrong passwords from one
// network never shuts the forgotten-password route there.
//
// A subject is a key, never shown: a space cannot be in an address or a network, so a
// known device's keys cannot be any stranger's.

const deviceIdShape = /^[A-Za-z0-9_-]{16,128}$/;

export type LimitSubjects = {
  /** The key counted with the address's limits; null when the address is not one. */
  readonly email: string | null;
  /** The key counted with the network's limits. */
  readonly network: string;
};

/** A device id that does not fit is the app's mistake: thrown (T-23). */
function checkedDevice(knownDevice: string | undefined): string | undefined {
  if (knownDevice === undefined) return undefined;
  if (!deviceIdShape.test(knownDevice)) throw new TypeError('The known device is not a device id.');
  return knownDevice;
}

/**
 * The keys for a password try or an ask for a code. A known device counts only for an
 * address that is one (the app vouches for a device and an address together).
 */
export function limitSubjects(
  email: string | null,
  network: string,
  knownDevice: string | undefined,
): LimitSubjects {
  const device = checkedDevice(knownDevice);
  if (device === undefined || email === null) return { email, network };
  return { email: `known-device ${device} ${email}`, network: `known-device ${device}` };
}

/** The network key for a code typed (T-506): apart from the same network's passwords. */
export function codeGuessSubject(network: string, knownDevice: string | undefined): string {
  const device = checkedDevice(knownDevice);
  return device === undefined ? `codes ${network}` : `codes known-device ${device}`;
}
