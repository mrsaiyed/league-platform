// A league's design: a small JSON document checked against a schema (T5 §1).
import { z } from 'zod';
import { fontKeys } from './fonts.ts';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #0b2233');
const assetRef = z.string().regex(/^asset:[A-Za-z0-9_-]+$/, 'Use an uploaded image');

export const designDocumentSchema = z.object({
  version: z.literal(1),
  base: z.enum(['light', 'dark']),
  colors: z.object({
    background: hexColor,
    panel: hexColor,
    text: hexColor,
    primary: hexColor,
    accent: hexColor,
    // Used sparingly to make a few things stand out; a design without one uses its accent (C-15).
    highlight: hexColor.optional(),
  }),
  fonts: z.object({ heading: z.enum(fontKeys), body: z.enum(fontKeys) }),
  corners: z.enum(['sharp', 'soft', 'round']),
  cards: z.enum(['flat', 'outlined', 'raised']),
  spacing: z.enum(['compact', 'comfortable', 'roomy']),
  logo: assetRef.optional(),
  icon: assetRef.optional(),
});

export type DesignDocument = z.infer<typeof designDocumentSchema>;

export function parseDesignDocument(
  input: unknown,
): { ok: true; design: DesignDocument } | { ok: false; problems: string[] } {
  const parsed = designDocumentSchema.safeParse(input);
  if (parsed.success) return { ok: true, design: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'design'}: ${i.message}`),
  };
}
