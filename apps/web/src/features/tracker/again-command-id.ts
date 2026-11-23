// The command ID of a kept play entered again (S-77; the code review's M1).
//
// The same kept play always gives the same ID, so entering it again twice (a second
// tap after taking it off its list failed, or after a reload) can never record it
// twice: the device sees it already holds the play, and the server answers a second
// copy as a duplicate. The ID is a UUID of version 8 (made by the device's own rule),
// worked out from the kept play's ID, so it differs from it and from the ID of a play
// entered again from that one.

const fnv32 = (text: string, seed: number): number => {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

export function againCommandId(keptCommandId: string): string {
  const text = `enter-again:${keptCommandId.toLowerCase()}`;
  const hex = [0x0, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => fnv32(text, seed).toString(16).padStart(8, '0'))
    .join('');
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
