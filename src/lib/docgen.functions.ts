import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OutlineInput = z.object({
  docType: z.string(),
  brief: z.string().min(10),
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
});

export const createOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OutlineInput.parse(input))
  .handler(async ({ data }) => {
    const { buildOutline } = await import("./docgen.server");
    return buildOutline(data.docType, data.brief);
  });

export const createSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SectionInput.parse(input))
  .handler(async ({ data }) => {
    const { writeSection } = await import("./docgen.server");
    const markdown = await writeSection(data);
    return { markdown };
  });
