// Whom a try is counted with (T-225, T-504, T-509), shared by every adapter so the local
// stand-in and the Supabase adapter count alike. A stranger's tries are counted against
// the address typed and the network they come from. A device the app vouches for (its
// signed cookie says this device has signed in to this address before, T-505) has its
// WRONG tries counted on its own: its wrong passwords and wrong codes never use up the
// address's or the network's allowance, and no stranger's use up its own. Its asks for
// a code are not spared (T-509): every ask is counted on the address and the plain
// network like a stranger's, so device ids made up for one's own address never send
// more mail. Sign-ups are counted apart on the network, with a number of their own
// (T-509). Wrong codes are counted apart from wrong passwords (T-506), so a flood of
// wrong passwords from one network never shuts the forgotten-password route there.
//
// A subject is a key, never shown: a space cannot be in an address or a network, so a
// known device's keys cannot be any stranger's.

import type { CodePurpose } from './sign-in-service.ts';

const deviceIdShape = /^[A-Za-z0-9_-]{16,128}$/;

export type LimitSubjects = {
  /** The key counted with the address's limits; null when the address is not one. */
  readonly email: string | null;
  /** The key counted with the network's limits. */
  readonly network: string;
};

/** A device id that does not fit is the app's mistake: thrown (T-23). */
export function checkedDevice(knownDevice: string | undefined): string | undefined {
  if (knownDevice === undefined) return undefined;
  if (!deviceIdShape.test(knownDevice)) throw new TypeError('The known device is not a device id.');
  return knownDevice;
}

/**
 * The keys for a password try. A known device counts only for an
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

/** The keys and numbers an ask for a code is counted on (T-509): never a known device's own. */
export function codeAskLimits(
  email: string,
  network: string,
  purpose: CodePurpose,
  settings: {
    readonly codesPerHour: number;
    readonly codesPerHourPerNetwork: number;
    readonly signUpsPerHourPerNetwork: number;
  },
): {
  readonly email: string;
  readonly network: string;
  readonly perEmail: number;
  readonly perNetwork: number;
} {
  // Each sign-up may make a user at the sign-in service: its own number on the network.
  return purpose === 'sign-up'
    ? {
        email,
        network: `sign-ups ${network}`,
        perEmail: settings.codesPerHour,
        perNetwork: settings.signUpsPerHourPerNetwork,
      }
    : {
        email,
        network,
        perEmail: settings.codesPerHour,
        perNetwork: settings.codesPerHourPerNetwork,
      };
}
