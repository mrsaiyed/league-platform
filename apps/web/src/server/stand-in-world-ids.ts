// The ids the one made-up world gives the rows it makes (stand-in-world.ts): version 7
// UUIDs, which start with the time, as the database's own (public.uuid_v7()). Rows the
// commands order by id (the season's teams, so standings ties, and the rest) then come in
// the order they were made, on the world as on the database: the scenario that runs one
// season on both sides found the order differ with random ids. Local work and tests only.
import { randomBytes } from 'node:crypto';

let lastMs = 0;
let sequence = 0;

/** A new version 7 UUID; two made in the same millisecond still sort in the order made. */
export function newId(now: number = Date.now()): string {
  let ms = Math.max(now, lastMs);
  sequence = ms === lastMs ? sequence + 1 : 0;
  // The count has twelve bits: once full, the next id takes the next millisecond.
  if (sequence > 0xfff) {
    ms += 1;
    sequence = 0;
  }
  lastMs = ms;
  const bytes = randomBytes(16);
  // 48 bits of milliseconds, then the version, then 12 bits that count within the millisecond.
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;
  // The variant (10xx).
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
