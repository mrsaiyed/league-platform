// The fixed list of fonts we host ourselves (T5 §1). A design stores a key, never a web address.
export const fontStacks = {
  cinzel: "'Cinzel', Georgia, serif",
  jost: "'Jost', system-ui, sans-serif",
  inter: "'Inter', system-ui, sans-serif",
  'playfair-display': "'Playfair Display', Georgia, serif",
  'source-sans': "'Source Sans 3', system-ui, sans-serif",
  oswald: "'Oswald', Impact, sans-serif",
  'noto-naskh-arabic': "'Noto Naskh Arabic', 'Noto Sans Arabic', serif",
} as const;

export type FontKey = keyof typeof fontStacks;

export const fontKeys = Object.keys(fontStacks) as [FontKey, ...FontKey[]];
