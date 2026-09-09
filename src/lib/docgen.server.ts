import { generateText, Output } from "ai";
import { z } from "zod";
import { COVER_LAYOUTS, LETTERHEAD_STYLES, normalizeDocumentDesign } from "./doc-design";
import { generateGeminiResearch, routedModel } from "./model-router.server";
import {
  outlinePrompt,
  sectionPrompt,
  verificationPrompt,
  type Outline,
  type VisualBrief,
} from "./prompts.server";

function cleanJson(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?/gm, "")
    .replace(/```$/gm, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI returned an invalid document outline.");
  return cleaned.slice(start, end + 1);
}

const documentDesignSchema = z.object({
  themeName: z.string().min(2).max(80),
  creativeDirection: z.string().min(30).max(600),
  primaryColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/),
  inkColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/),
  mutedColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/),
  headingFont: z.enum(["Aptos Display", "Arial", "Georgia"]),
  bodyFont: z.enum(["Aptos", "Arial", "Georgia"]),
  coverLayout: z.enum(COVER_LAYOUTS),
  letterheadStyle: z.enum(LETTERHEAD_STYLES),
  coverArtPrompt: z.string().min(40).max(1800),
});

const outlineSchema = z.object({
  title: z.string().min(2).max(240),
  subtitle: z.string().max(500),
  referenceProfile: z.string().max(6_000).optional(),
  sections: z
    .array(
      z.object({
        heading: z.string().min(2).max(180),
        brief: z.string().min(10).max(1200),
        targetWords: z.number().min(300).max(1800),
      }),
    )
    .min(1)
    .max(24),
  visuals: z
    .array(
      z.object({
        title: z.string().min(2).max(160),
        prompt: z.string().min(10).max(1800),
        kind: z.string().min(2).max(40),
        afterSection: z.string().max(180).nullable(),
      }),
    )
    .max(4),
});

export async function designDocument(args: {
  docType: string;
  title: string;
  subtitle: string;
  brief: string;
  companyName?: string | undefined;
  contact?: string | undefined;
  brandColor?: string | undefined;
  jurisdiction?: string | undefined;
  referenceProfile?: string | undefined;
}) {
  const lead = routedModel("visual_finance");
  const result = await generateText({
    model: lead.model,
    output: Output.object({ schema: documentDesignSchema }),
    providerOptions: {
      openai: { reasoningEffort: "minimal", textVerbosity: "low" },
    },
    prompt: `You are the senior editorial art director for a premium strategy consultancy.

Create a bespoke, boardroom-ready visual system for this ${args.docType.replaceAll("_", " ")}.

Document title: ${args.title}
Subtitle: ${args.subtitle || "Not supplied"}
Company: ${args.companyName || "Not supplied"}
Contact line: ${args.contact || "Not supplied"}
Sampled logo colour: ${args.brandColor ? `#${args.brandColor.replace(/^#/, "")}` : "Not available"}
Client brief: ${args.brief.slice(0, 6000)}
Jurisdiction / primary market: ${args.jurisdiction || "Not supplied"}
${args.referenceProfile ? `Reference document style profile: ${args.referenceProfile.slice(0, 4000)}` : ""}

Requirements:
- Make the theme specific to the industry and audience, elegant rather than decorative.
- Preserve high contrast, legibility and enough white space for a 50-60 page report.
- If a logo colour is supplied, harmonise with it; do not blindly copy it into every palette field.
- Use only the allowed fonts because the Word and PDF renderers must reproduce the design reliably.
- coverArtPrompt must describe one premium, text-free editorial hero image suitable for the front cover.
- The artwork must contain no words, letters, numbers, logos, seals, watermarks, UI, financial figures or technical annotations. The exporter will typeset all accurate wording separately.
- Never put factual claims, calculations or construction details into the artwork.
- Return only the structured design object.`,
    maxOutputTokens: 4_000,
  });

  return {
    design: normalizeDocumentDesign(result.output),
    provider: `${lead.provider} art direction`,
  };
}

type OutlineCandidate = Omit<Partial<Outline>, "visuals"> & {
  visuals?: {
    title: string;
    prompt: string;
    kind: string;
    afterSection?: string | null | undefined;
  }[];
};

function normalizeOutline(parsed: OutlineCandidate, research: string): Outline {
  if (!parsed?.sections?.length) throw new Error("The AI returned an empty outline. Try again.");
  const visualKinds = new Set<VisualBrief["kind"]>(["concept", "diagram", "layout", "chart"]);
  return {
    title: String(parsed.title || "Professional Document"),
    subtitle: String(parsed.subtitle || ""),
    sections: parsed.sections.slice(0, 24).map((section) => ({
      heading: String(section.heading || "Section"),
      brief: String(section.brief || ""),
      targetWords: Math.min(1600, Math.max(450, Number(section.targetWords) || 900)),
    })),
    visuals: (parsed.visuals ?? []).slice(0, 4).map((visual) => ({
      title: String(visual.title || "Project visual"),
      prompt: String(visual.prompt || "Premium professional project concept visual"),
      kind: visualKinds.has(visual.kind as VisualBrief["kind"])
        ? (visual.kind as VisualBrief["kind"])
        : "concept",
      ...(visual.afterSection ? { afterSection: String(visual.afterSection) } : {}),
    })),
    research: research.slice(0, 14_000),
    referenceProfile: String(parsed.referenceProfile || "").slice(0, 6_000),
  };
}

function parseOutline(text: string, research: string): Outline {
  return normalizeOutline(JSON.parse(cleanJson(text)) as OutlineCandidate, research);
}

export async function buildOutline(args: {
  docType: string;
  brief: string;
  jurisdiction?: string | undefined;
  referenceName?: string | undefined;
  referenceText?: string | undefined;
}): Promise<Outline> {
  const researchAsOf = new Date().toISOString().slice(0, 10);
  const jurisdiction = args.jurisdiction?.trim() || "the market stated in the brief";
  const research = await generateGeminiResearch(
    `Research current, decision-relevant facts for a ${args.docType.replaceAll("_", " ")} in ${jurisdiction} based on this brief. Research date: ${researchAsOf}. Reference filename (style signal only): ${args.referenceName || "None"}. Never default to United States law, tax, currency, spelling or institutions unless the stated market is the United States. Prioritise official government, regulator, standards-body, national statistics, central-bank, funder-guideline, company filing and other primary sources from the stated jurisdiction. For South Africa, prioritise relevant current material from Statistics South Africa, the South African Reserve Bank, SARS, CIPC, the dtic, the B-BBEE Commission, the Department of Employment and Labour, provincial or municipal authorities, and the named funder's official guidance. If the NEF is named, verify its current official application form, minimum business-plan information and supporting-document requirements. For every factual note give its direct source URL, source title, publication/effective date when available, and the jurisdiction it supports. Organise findings by macroeconomy, industry, demand/customers, competitors, pricing, supply chain, regulation/compliance, funding criteria and socio-economic impact as applicable. Clearly separate user inputs, sourced facts, calculations, estimates and unresolved information gaps. Do not invent data or citations. If a claim cannot be sourced, say so explicitly.\n\n${args.brief}`,
  );
  const lead = routedModel("research");
  const prompt = outlinePrompt(args.docType, args.brief, research, {
    jurisdiction: args.jurisdiction,
    referenceName: args.referenceName,
    referenceText: args.referenceText,
  });
  const { text } = await generateText({
    model: lead.model,
    prompt,
    maxOutputTokens: 8_000,
    providerOptions: {
      openai: { reasoningEffort: "low", textVerbosity: "low" },
    },
  });
  try {
    return parseOutline(text, research);
  } catch (error) {
    console.warn(
      "[outline] primary response was not valid JSON; regenerating with structured output",
      error instanceof Error ? error.message.slice(0, 300) : "Unknown parse error",
    );
    const recovery = routedModel("visual_finance");
    const recovered = await generateText({
      model: recovery.model,
      output: Output.object({ schema: outlineSchema }),
      prompt: `${prompt}\n\nThe earlier response could not be parsed. Regenerate the complete, concise outline now using the required structured schema. Keep each section brief under 120 words.`,
      maxOutputTokens: 8_000,
      providerOptions: {
        openai: { reasoningEffort: "low", textVerbosity: "low" },
      },
    });
    return normalizeOutline(recovered.output, research);
  }
}

function openAiLead(heading: string) {
  return /financ|revenue|cost|budget|fund|cash|profit|break-even|ratio|npv|irr|payback|technical|site|infrastructure|layout|architect|structur|design/i.test(
    heading,
  );
}

export async function writeSection(args: {
  docType: string;
  brief: string;
  title: string;
  outlineHeadings: string[];
  heading: string;
  sectionBrief: string;
  targetWords: number;
  previousSummary: string;
  research?: string | undefined;
  financialModel?: string | undefined;
  jurisdiction?: string | undefined;
  referenceProfile?: string | undefined;
  verify?: boolean | undefined;
}) {
  const leadRole = openAiLead(args.heading) ? "visual_finance" : "research";
  const reviewRole = leadRole === "research" ? "visual_finance" : "research";
  const lead = routedModel(leadRole);
  const draftResult = await generateText({
    model: lead.model,
    prompt: sectionPrompt({ ...args, leadProvider: lead.provider }),
    maxOutputTokens: 5_500,
    providerOptions: {
      openai: { reasoningEffort: "low", textVerbosity: "medium" },
    },
  });
  let markdown = draftResult.text.trim();
  if (!markdown.startsWith("#")) markdown = `## ${args.heading}\n\n${markdown}`;

  if (args.verify !== false) {
    const reviewer = routedModel(reviewRole);
    const reviewed = await generateText({
      model: reviewer.model,
      prompt: verificationPrompt({
        title: args.title,
        heading: args.heading,
        draft: markdown,
        brief: args.brief,
        financialModel: args.financialModel,
        jurisdiction: args.jurisdiction,
        referenceProfile: args.referenceProfile,
        verifier: reviewer.provider,
      }),
      maxOutputTokens: 5_500,
      providerOptions: {
        openai: { reasoningEffort: "low", textVerbosity: "medium" },
      },
    });
    const checked = reviewed.text.trim();
    if (checked.length > 200)
      markdown = checked.startsWith("#") ? checked : `## ${args.heading}\n\n${checked}`;
    return { markdown, lead: lead.provider, reviewer: reviewer.provider };
  }

  return { markdown, lead: lead.provider, reviewer: "Verification disabled" };
}
