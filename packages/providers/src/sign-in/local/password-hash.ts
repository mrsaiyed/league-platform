// A one-way hash for the stand-in's passwords, so not even the stand-in keeps one in
// readable form (T-85). Cheap settings, because tests hash a great many: the real
// service's hash is the vendor's. Not for production.
import { randomBytes, scrypt, timingSafeEqual, type BinaryLike } from 'node:crypto';

export type PasswordHash = { readonly salt: Buffer; readonly key: Buffer };

/** What the stand-in hashes with. Tests may pass one that counts its calls. */
export type PasswordHasher = {
  readonly hash: (password: string) => Promise<PasswordHash>;
  /**
   * True if `password` matches. With no stored hash it must still do the work of one,
   * so an unknown address takes as long to refuse as a wrong password (T-68).
   */
  readonly matches: (password: string, stored: PasswordHash | undefined) => Promise<boolean>;
};

const keyLength = 32;
const cost = { N: 1024, r: 8, p: 1 };
const decoySalt = randomBytes(16);

const derive = (password: string, salt: BinaryLike) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keyLength, cost, (error, key) => (error ? reject(error) : resolve(key))),
  );

export const scryptPasswordHasher: PasswordHasher = {
  async hash(password) {
    const salt = randomBytes(16);
    return { salt, key: await derive(password, salt) };
  },
  async matches(password, stored) {
    const key = await derive(password, stored?.salt ?? decoySalt);
    return stored !== undefined && timingSafeEqual(key, stored.key);
  },
};
