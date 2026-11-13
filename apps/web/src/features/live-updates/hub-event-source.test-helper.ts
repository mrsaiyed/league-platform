// A stand-in for the browser's EventSource that reads straight from the local live
// hub's `serve`, as a browser would over the network. For tests only.
import type { LocalLiveHub } from '@srleagues/providers';
import type { EventSourceLike } from './server-sent-events-subscriber.ts';

class HubEventSource implements EventSourceLike {
  readyState = 0;
  readonly url: string;
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();
  private readonly leaving = new AbortController();

  constructor(hub: LocalLiveHub, url: string) {
    this.url = url;
    const response = hub.serve(
      new Request(new URL(url, 'http://local.test'), { signal: this.leaving.signal }),
    );
    const isStream = response.headers.get('Content-Type')?.startsWith('text/event-stream');
    if (response.status !== 200 || !isStream) {
      // The browser gives up on a refusal and does not try again.
      queueMicrotask(() => {
        this.readyState = 2;
        this.emit('error', new Event('error'));
      });
      return;
    }
    queueMicrotask(() => {
      if (this.readyState === 2) return;
      this.readyState = 1;
      this.emit('open', new Event('open'));
    });
    void this.read(response);
  }

  private async read(response: Response): Promise<void> {
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const lines = buffer.slice(0, end).split('\n');
          buffer = buffer.slice(end + 2);
          const event = lines.find((l) => l.startsWith('event: '))?.slice(7);
          const data = lines.find((l) => l.startsWith('data: '))?.slice(6);
          if (event !== undefined && data !== undefined && this.readyState !== 2) {
            this.emit(event, new MessageEvent(event, { data }));
          }
        }
      }
    } catch {
      // Closed by the page.
    }
  }

  private emit(type: string, event: Event): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close(): void {
    this.readyState = 2;
    this.leaving.abort();
  }
}

/** An `open` for serverSentEventsSubscriber that listens to `hub`, and what it opened. */
export function hubEventSources(hub: LocalLiveHub) {
  const opened: HubEventSource[] = [];
  const open = (url: string): EventSourceLike => {
    const source = new HubEventSource(hub, url);
    opened.push(source);
    return source;
  };
  return { open, opened };
}
