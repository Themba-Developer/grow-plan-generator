import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OutlineInput = z.object({
  docType: z.string(),
  brief: z.string().min(10),
  jurisdiction: z.string().min(2).max(120).optional(),
  referenceName: z.string().max(240).optional(),
  referenceText: z.string().max(60_000).optional(),
});

const SectionInput = z.object({
  docType: z.string(),
  brief: z.string().min(10),
  title: z.string(),
  outlineHeadings: z.array(z.string()),
  heading: z.string(),
  sectionBrief: z.string(),
  targetWords: z.number(),
  previousSummary: z.string(),
  research: z.string().max(20_000).optional(),
  financialModel: z.string().max(30_000).optional(),
  jurisdiction: z.string().max(120).optional(),
  referenceProfile: z.string().max(6_000).optional(),
  verify: z.boolean().optional(),
});

const VisualInput = z.object({
  title: z.string().min(2).max(160),
  prompt: z.string().min(10).max(4_000),
  kind: z.enum(["concept", "diagram", "layout", "chart"]).default("concept"),
});

const DesignInput = z.object({
  docType: z.string(),
  title: z.string().min(2).max(240),
  subtitle: z.string().max(500),
  brief: z.string().min(10).max(20_000),
  companyName: z.string().max(200).optional(),
  contact: z.string().max(500).optional(),
  brandColor: z
    .string()
    .regex(/^#?[0-9A-Fa-f]{6}$/)
    .optional(),
  jurisdiction: z.string().max(120).optional(),
  referenceProfile: z.string().max(6_000).optional(),
});

export const createOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => OutlineInput.parse(input))
  .handler(async ({ data }) => {
    const { buildOutline } = await import("./docgen.server");
    return buildOutline(data);
  });

export const createSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SectionInput.parse(input))
  .handler(async ({ data }) => {
    const { writeSection } = await import("./docgen.server");
    return writeSection(data);
  });

export const createDocumentDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DesignInput.parse(input))
  .handler(async ({ data }) => {
    const { designDocument } = await import("./docgen.server");
    return designDocument(data);
  });

export const createVisual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => VisualInput.parse(input))
  .handler(async ({ data }) => {
    const { generateOpenAiImage } = await import("./model-router.server");
    const boundary =
      data.kind === "layout"
        ? " Include a clearly visible 'CONCEPTUAL - NOT FOR CONSTRUCTION' footer. Do not include professional seals, approvals, exact load ratings or permit claims."
        : data.kind === "chart"
          ? " Do not invent numerical values. Use only values explicitly supplied in the brief; otherwise create a non-numeric editorial infographic and leave data-specific labels out."
          : "";
    const image = await generateOpenAiImage(
      `${data.prompt}\n\nProfessional business-document visual, premium editorial quality, clean composition, accurate legible labels where requested, no logos, no watermarks.${boundary}`,
    );
    return { ...image, title: data.title, kind: data.kind };
  });

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { modelConfiguration, GEMINI_MODELS, OPENAI_MODELS, OPENAI_IMAGE_MODEL } =
      await import("./model-router.server");
    return {
      ...modelConfiguration(),
      models: {
        research: `${GEMINI_MODELS.length} automatic options`,
        review: `${OPENAI_MODELS.length} automatic options`,
        image: OPENAI_IMAGE_MODEL,
      },
    };
  });
