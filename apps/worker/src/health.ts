// The worker's health check (T8 §7: "the worker's heartbeat"). The worker records a
// beat each time its loop runs (and each time it finishes a job); an outside check
// asks this endpoint, which answers 200 while the last beat is recent and 503 when
// it is older than `maxAgeMs` or has never happened. The answer holds fixed words
// and numbers only (T-86). start-worker.ts beats after each look at the jobs table
// that worked. The jobs waiting and the age of the oldest (T-142) are not here yet:
// counting them across leagues needs an owner-run function, a migration (record 053).
import { createServer, type Server } from 'node:http';

export type WorkerHealth = {
  readonly status: 'ok' | 'down';
  readonly app: 'worker';
  /** Which queue runs the jobs, from the wiring. */
  readonly queue: 'table' | 'pg-boss';
  /** Seconds since the last beat; null when there has been none. */
  readonly secondsSinceBeat: number | null;
};

export type Heartbeat = {
  /** Records that the worker is alive now. */
  readonly beat: () => void;
  readonly health: () => { httpStatus: 200 | 503; body: WorkerHealth };
};

export type HeartbeatOptions = {
  readonly queue: 'table' | 'pg-boss';
  /** A beat older than this means the worker is down. */
  readonly maxAgeMs: number;
  /** Milliseconds since the epoch; injected so tests are exact. Default Date.now. */
  readonly now?: () => number;
};

export function createHeartbeat(options: HeartbeatOptions): Heartbeat {
  const now = options.now ?? Date.now;
  let last: number | null = null;
  return {
    beat: () => {
      last = now();
    },
    health: () => {
      const age = last === null ? null : Math.max(0, now() - last);
      const ok = age !== null && age <= options.maxAgeMs;
      return {
        httpStatus: ok ? 200 : 503,
        body: {
          status: ok ? 'ok' : 'down',
          app: 'worker',
          queue: options.queue,
          secondsSinceBeat: age === null ? null : Math.floor(age / 1000),
        },
      };
    },
  };
}

/**
 * Serves GET /health from the heartbeat on the given port (0 picks a free one).
 * Any other address is 404. Returns the server; close it to stop.
 */
export function startHealthServer(heartbeat: Heartbeat, port: number): Promise<Server> {
  const server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0];
    const isHead = request.method === 'HEAD';
    if ((request.method !== 'GET' && !isHead) || path !== '/health') {
      response.writeHead(404).end();
      return;
    }
    const { httpStatus, body } = heartbeat.health();
    response.writeHead(httpStatus, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    // HEAD gets the same status and headers as GET, without the body.
    response.end(isHead ? undefined : JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      // Listening worked: a later fault must not reach a promise already settled.
      server.off('error', reject);
      resolve(server);
    });
  });
}
