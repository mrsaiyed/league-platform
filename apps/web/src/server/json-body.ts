// A league endpoint's request body read as JSON (T-26). Only a body declared as JSON
// (`Content-Type: application/json`, any parameters such as a charset) is read; any
// other is no body, which every endpoint answers 400 invalid-input. The limit is in
// bytes, as sent, not in characters once decoded.

/** The most a request body may hold. A full batch of 50 taps is a few kilobytes. */
export const maxBodyBytes = 64 * 1024;

/** Whether the request says its body is JSON. */
function declaresJson(request: Request): boolean {
  const type = request.headers.get('content-type') ?? '';
  const media = (type.split(';')[0] ?? '').trim().toLowerCase();
  return media === 'application/json';
}

/**
 * The body's bytes, or undefined once more than `limit` arrive: a body sent without a
 * length (or with a false one) is never read further than the limit.
 */
async function readAtMost(request: Request, limit: number): Promise<Uint8Array | undefined> {
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/** The body as JSON, or undefined when it is not declared JSON, is not JSON or is too large. */
export async function jsonBody(request: Request): Promise<unknown> {
  if (!declaresJson(request)) return undefined;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBodyBytes) return undefined;
  let bytes: Uint8Array | undefined;
  try {
    bytes = await readAtMost(request, maxBodyBytes);
  } catch {
    return undefined;
  }
  if (bytes === undefined) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
