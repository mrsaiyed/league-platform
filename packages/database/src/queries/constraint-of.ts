// Which database constraint an error is about, or undefined if it is not a
// constraint error. Lets a query turn a refused short name into an answer instead of
// a crash; the rule itself stays in the database (0003).
export function constraintOf(error: unknown): { code: string; constraint: string } | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return typeof code === 'string' && typeof constraint === 'string'
    ? { code, constraint }
    : undefined;
}
