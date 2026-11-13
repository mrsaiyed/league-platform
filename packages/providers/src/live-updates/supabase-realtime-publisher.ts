// Supabase Realtime (T-8), the server's side: publishes each message through
// Realtime's broadcast address (POST /realtime/v1/api/broadcast), so viewers'
// connections sit on Supabase and not on our web servers.
//
// NOT VERIFIED against the live service. Written from Supabase's published API and
// tested only against recorded-style answers, never over the network (T-201). It is
// checked against a real project when the founder's vendor accounts exist (stage 2,
// "Vendor accounts for a real demo").
//
// Only our server can publish (T-120): every message goes out on a private channel,
// with the project's secret key, which only the server holds. On private channels
// Realtime lets a browser do only what the project's policies on realtime.messages
// allow, and those must let viewers receive and never send. Those policies are set
// up with the real project; until then this is part of what is not verified.
//
// Errors carry a fixed code and the HTTP status, never the response text or the key.
import { LivePublishError, livePublisherFrom, type LivePublisher } from './live-publisher.ts';

export type SupabaseRealtimePublisherOptions = {
  /** The project's address, such as https://<project>.supabase.co. */
  readonly url: string;
  /** The project's secret key: server only. */
  readonly secretKey: string;
  /** Stand-in for tests; the real fetch otherwise. */
  readonly fetch?: typeof fetch;
  /** How long to wait for an answer. Default 5 seconds: a late live message is of little use. */
  readonly timeoutMs?: number;
};

function refusal(status: number): LivePublishError {
  if (status === 429) return new LivePublishError('rate-limited', true, status);
  if (status === 401 || status === 403)
    return new LivePublishError('not-authorized', false, status);
  if (status >= 500) return new LivePublishError('unavailable', true, status);
  return new LivePublishError('rejected', false, status);
}

export function supabaseRealtimePublisher(
  options: SupabaseRealtimePublisherOptions,
): LivePublisher {
  const send = options.fetch ?? fetch;
  const url = `${options.url.replace(/\/+$/, '')}/realtime/v1/api/broadcast`;
  return livePublisherFrom(async (delivery) => {
    let response: Response;
    try {
      response = await send(url, {
        method: 'POST',
        headers: { apikey: options.secretKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              topic: delivery.channel,
              event: delivery.event,
              payload: delivery.payload,
              private: true,
            },
          ],
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      });
    } catch {
      // Unreachable, or no answer in time.
      throw new LivePublishError('unavailable', true);
    }
    // Realtime answers 202 Accepted with no body; any success is taken. The body is
    // let go either way; if even that fails, the connection broke mid-answer.
    let bodyLost = false;
    try {
      await response.body?.cancel();
    } catch {
      bodyLost = true;
    }
    if (!response.ok) throw refusal(response.status);
    if (bodyLost) throw new LivePublishError('unavailable', true, response.status);
  });
}
