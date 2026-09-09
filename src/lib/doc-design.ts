export const COVER_LAYOUTS = [
  "editorial_split",
  "full_bleed",
  "geometric_frame",
  "minimal_luxury",
] as const;

export const LETTERHEAD_STYLES = ["top_band", "logo_rule", "asymmetric"] as const;

export type DocumentDesign = {
  themeName: string;
  creativeDirection: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  inkColor: string;
  mutedColor: string;
  headingFont: "Aptos Display" | "Arial" | "Georgia";
  bodyFont: "Aptos" | "Arial" | "Georgia";
  coverLayout: (typeof COVER_LAYOUTS)[number];
  letterheadStyle: (typeof LETTERHEAD_STYLES)[number];
  coverArtPrompt: string;
};

export const DEFAULT_DOCUMENT_DESIGN: DocumentDesign = {
  themeName: "Black R Executive",
  creativeDirection:
    "A confident, restrained executive report with strong hierarchy, generous whitespace and a single vivid accent.",
  primaryColor: "111827",
  secondaryColor: "F3F4F6",
  accentColor: "C8102E",
  inkColor: "111111",
  mutedColor: "667085",
  headingFont: "Aptos Display",
  bodyFont: "Aptos",
  coverLayout: "editorial_split",
  letterheadStyle: "logo_rule",
  coverArtPrompt:
    "Premium abstract editorial artwork with refined architectural geometry, subtle depth and generous negative space.",
};

function cleanHex(value: unknown, fallback: string) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  return /^[0-9A-F]{6}$/.test(cleaned) ? cleaned : fallback;
}

function selected<T extends readonly string[]>(value: unknown, choices: T, fallback: T[number]) {
  return choices.includes(value as T[number]) ? (value as T[number]) : fallback;
}

export function normalizeDocumentDesign(value?: Partial<DocumentDesign> | null): DocumentDesign {
  const source = value ?? {};
  const headingFonts = ["Aptos Display", "Arial", "Georgia"] as const;
  const bodyFonts = ["Aptos", "Arial", "Georgia"] as const;

  return {
    themeName: String(source.themeName || DEFAULT_DOCUMENT_DESIGN.themeName).slice(0, 80),
    creativeDirection: String(
      source.creativeDirection || DEFAULT_DOCUMENT_DESIGN.creativeDirection,
    ).slice(0, 600),
    primaryColor: cleanHex(source.primaryColor, DEFAULT_DOCUMENT_DESIGN.primaryColor),
    secondaryColor: cleanHex(source.secondaryColor, DEFAULT_DOCUMENT_DESIGN.secondaryColor),
    accentColor: cleanHex(source.accentColor, DEFAULT_DOCUMENT_DESIGN.accentColor),
    inkColor: cleanHex(source.inkColor, DEFAULT_DOCUMENT_DESIGN.inkColor),
    mutedColor: cleanHex(source.mutedColor, DEFAULT_DOCUMENT_DESIGN.mutedColor),
    headingFont: selected(source.headingFont, headingFonts, DEFAULT_DOCUMENT_DESIGN.headingFont),
    bodyFont: selected(source.bodyFont, bodyFonts, DEFAULT_DOCUMENT_DESIGN.bodyFont),
    coverLayout: selected(source.coverLayout, COVER_LAYOUTS, DEFAULT_DOCUMENT_DESIGN.coverLayout),
    letterheadStyle: selected(
      source.letterheadStyle,
      LETTERHEAD_STYLES,
      DEFAULT_DOCUMENT_DESIGN.letterheadStyle,
    ),
    coverArtPrompt: String(source.coverArtPrompt || DEFAULT_DOCUMENT_DESIGN.coverArtPrompt).slice(
      0,
      1800,
    ),
  };
}
