// The fixed list of fonts we host ourselves (T5 §1). A design stores a key, never a web address.
// Until a font's files are served, a reader sees the next face in its list, so each list
// names faces a phone or a laptop already has that keep the same character: a classical
// serif for Cinzel, a narrow sans for Oswald, never a heavy poster face.
export const fontStacks = {
  cinzel: "'Cinzel', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  jost: "'Jost', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  inter: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  'playfair-display': "'Playfair Display', Georgia, serif",
  'source-sans': "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  oswald: "'Oswald', 'Arial Narrow', 'Roboto Condensed', system-ui, sans-serif",
  'noto-naskh-arabic': "'Noto Naskh Arabic', 'Noto Sans Arabic', serif",
} as const;

export type FontKey = keyof typeof fontStacks;

export const fontKeys = Object.keys(fontStacks) as [FontKey, ...FontKey[]];
