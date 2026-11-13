// T-86: no personal content in logs or error reports. Two nets, because neither is
// enough alone: values under a sensitive key are replaced whatever they hold, and
// text that looks like an email address, a credential, a code, a phone number or a
// long secret is scrubbed wherever it appears. Free-text names cannot be recognised,
// so a field that could hold one must never be passed in; the key list refuses the
// usual ones.

export const REDACTED = '[redacted]';

/** Words (a key is split at capitals, _ and -) that mark a value as never kept. */
const sensitiveWords = new Set([
  'email',
  'emails',
  'name',
  'names',
  'password',
  'passwd',
  'passcode',
  'secret',
  'secrets',
  'token',
  'tokens',
  'authorization',
  'auth',
  'cookie',
  'cookies',
  'session',
  'code',
  'otp',
  'pin',
  'answer',
  'answers',
  'body',
  'message',
  'text',
  'phone',
  'mobile',
  'address',
  'credential',
  'credentials',
  'birthday',
  'birthdate',
  'dob',
  'input',
  'form',
  'comment',
  'bio',
]);

/** Single lower-case keys that join two words and so cannot be split. */
const sensitiveCompounds = new Set([
  'apikey',
  'accesskey',
  'privatekey',
  'secretkey',
  'firstname',
  'lastname',
  'fullname',
  'username',
  'displayname',
  'nickname',
  'surname',
  'givenname',
  'familyname',
  'jwt',
  'sessionid',
]);

/** Keys the word list would catch but that hold fixed words or counts and are already scrubbed. */
const safeKeys = new Set([
  'errormessage',
  'errorcode',
  'errorname',
  'statuscode',
  'jobname',
  'commandname',
  'requestid',
  'msg',
  'command',
  'module',
]);

const emailShape = /[^\s@<>()"',;:/]+@[^\s@<>()"',;:/]+\.[a-z]{2,}/gi;
// scheme://anything@host: user:password, a bare token, with or without a TLD.
const urlCredentialShape = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const bearerShape = /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]{8,}/gi;
const jwtShape = /\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\.[a-z0-9_-]*/gi;
const prefixedKeyShape = /\b(?:sk|pk|rk|sbp|ghp|gho|xox[a-z])[_-][a-z0-9_-]{12,}/gi;
const codeShape = /\b((?:code|otp|pin|passcode)\b(?:\s+is)?\s*[:=#-]?\s*)\d{4,8}\b/gi;
const phoneShapes = [
  /(?<![\w-])\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\w-])/g,
  /(?<![\w-])\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w-])/g,
];
// Long unbroken runs of letters and digits: digests, base64, random secrets. A run is
// treated as a secret only if it mixes letters and digits, so words, paths and
// kebab-case names survive; ids and trace ids (UUID, 32 hex) are kept.
const longRunShape = /[a-z0-9_+=-]{32,}/gi;
const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const traceIdShape = /^[0-9a-f]{32}$/i;

const maxStringLength = 2000;
const maxArrayLength = 50;
const maxKeys = 100;
const maxDepth = 6;

function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSensitiveKey(key: string): boolean {
  const flat = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (safeKeys.has(flat)) return false;
  if (sensitiveCompounds.has(flat)) return true;
  if (['apikey', 'accesskey', 'privatekey', 'secretkey'].some((part) => flat.includes(part))) {
    return true;
  }
  return words(key).some((word) => sensitiveWords.has(word));
}

function isSecretRun(run: string): boolean {
  if (uuidShape.test(run) || traceIdShape.test(run)) return false;
  return /\d/.test(run) && /[a-z]/i.test(run);
}

/** Scrubs personal-looking and secret-looking shapes out of one piece of text. */
export function redactText(text: string): string {
  let out = text.length > maxStringLength ? `${text.slice(0, maxStringLength)}[truncated]` : text;
  if (uuidShape.test(out)) return out;
  out = out
    .replace(urlCredentialShape, `$1${REDACTED}@`)
    .replace(emailShape, REDACTED)
    .replace(jwtShape, REDACTED)
    .replace(bearerShape, REDACTED)
    .replace(prefixedKeyShape, REDACTED)
    .replace(codeShape, `$1${REDACTED}`);
  for (const shape of phoneShapes) out = out.replace(shape, REDACTED);
  return out.replace(longRunShape, (run) => (isSecretRun(run) ? REDACTED : run));
}

/**
 * A copy of `value` that is safe to write: sensitive keys masked, text scrubbed,
 * errors reduced to their name and scrubbed message, binary data and long lists cut,
 * depth and cycles bounded. Functions and symbols are dropped; it never throws, and a
 * field that cannot be read becomes "[unreadable]" without losing its neighbours.
 */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  try {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return redactText(value);
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value !== 'object') return undefined;
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[binary]';
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (seen.has(value)) return '[circular]';
    if (depth >= maxDepth) return '[too deep]';
    seen.add(value);
    if (value instanceof Error) {
      return { name: redactText(String(value.name)), message: redactText(String(value.message)) };
    }
    if (Array.isArray(value)) {
      const items = value
        .slice(0, maxArrayLength)
        .map((item) => redact(item, depth + 1, seen) ?? null);
      if (value.length > maxArrayLength) items.push(`[${value.length - maxArrayLength} more]`);
      return items;
    }
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, maxKeys)) {
      try {
        const inner = (value as Record<string, unknown>)[key];
        if (inner === undefined || typeof inner === 'function' || typeof inner === 'symbol') {
          continue;
        }
        out[key] = isSensitiveKey(key) ? REDACTED : redact(inner, depth + 1, seen);
      } catch {
        out[key] = '[unreadable]';
      }
    }
    if (keys.length > maxKeys) out['[more keys]'] = keys.length - maxKeys;
    return out;
  } catch {
    return '[unreadable]';
  }
}
