// What an area of the web app does on the database before it has moved there (step 2.93,
// record 055): it refuses the moment it is reached, so its page shows the error page,
// never made-up data that is not in the database.

/** An area used before it has moved onto the database (record 055). */
export class NotOnTheDatabaseYet extends Error {
  readonly area: string;
  constructor(area: string) {
    super(`The web app's ${area} does not run on the database yet (step 2.93).`);
    this.name = 'NotOnTheDatabaseYet';
    this.area = area;
  }
}

/** Refuses at once: for one port of an area that has otherwise moved. */
export const notOnTheDatabaseYet = (area: string): never => {
  throw new NotOnTheDatabaseYet(area);
};

/**
 * An area's ports that refuse the moment any of them is reached. `then` and symbols
 * answer nothing, so awaiting or printing the object itself does not refuse.
 */
export function notMovedYet<T extends object>(area: string): T {
  const handler: ProxyHandler<object> = {
    get: (_target, name) =>
      typeof name === 'symbol' || name === 'then' ? undefined : notOnTheDatabaseYet(area),
  };
  return new Proxy({}, handler) as T;
}
