import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { CHAT_MODEL, outlinePrompt, sectionPrompt, type Outline } from "./prompts.server";

function gateway() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  return createLovableAiGatewayProvider(key)(CHAT_MODEL);
}

function parseOutline(text: string): Outline {
  const cleaned = text
    .replace(/^```(?:json)?/gm, "")
    .replace(/```$/gm, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Outline;
  if (!parsed?.sections?.length) throw new Error("The AI returned an empty outline. Try again.");
  return {
    title: String(parsed.title || "Business Plan"),
    subtitle: String(parsed.subtitle || ""),
    sections: parsed.sections.slice(0, 24).map((section) => ({
      heading: String(section.heading || "Section"),
      brief: String(section.brief || ""),
      targetWords: Math.min(1600, Math.max(600, Number(section.targetWords) || 900)),
    })),
  };
}

export async function buildOutline(docType: string, brief: string): Promise<Outline> {
  const { text } = await generateText({
    model: gateway(),
    prompt: outlinePrompt(docType, brief),
  });
  return parseOutline(text);
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
}): Promise<string> {
  const { text } = await generateText({
    model: gateway(),
    prompt: sectionPrompt(args),
  });
  const body = text.trim();
  return body.startsWith("#") ? body : `## ${args.heading}\n\n${body}`;
}
