// A team or division color reaches a component as one #rrggbb value (T5 §1); anything else
// is dropped, so nothing a league types can reach a style attribute.
const hex = /^#[0-9a-fA-F]{6}$/;

export function safeColor(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && hex.test(value) ? value : undefined;
}
