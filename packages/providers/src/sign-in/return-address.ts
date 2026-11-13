// Where Google may send the browser back to (T-67). Only our own addresses, so the
// sign-in cannot be bent into sending a person, or their code, somewhere else. Every
// adapter checks the return address with this before it starts.

export type ReturnAddressRules = {
  /** Our own origins, such as `https://app.example.test`. Nothing else is allowed. */
  readonly allowedOrigins: readonly string[];
  /** Plain http, only to this machine, for local development and tests. */
  readonly allowLocalHttp: boolean;
};

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

const originOf = (address: string): string | null => {
  try {
    return new URL(address).origin;
  } catch {
    return null;
  }
};

export function isAllowedReturnAddress(address: string, rules: ReturnAddressRules): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const secure = url.protocol === 'https:';
  const localHttp =
    url.protocol === 'http:' && rules.allowLocalHttp && localHosts.has(url.hostname);
  if (!secure && !localHttp) return false;
  return rules.allowedOrigins.some((allowed) => originOf(allowed) === url.origin);
}
