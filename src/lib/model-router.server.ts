import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";

export const GEMINI_MODEL = "gemini-3.7-flash";
export const OPENAI_MODEL = "gpt-5";
export const OPENAI_IMAGE_MODEL = "gpt-image-2";

function configuredModels(name: string, defaults: string[]) {
  const configured = process.env[name]
    ?.split(",")
    .map((model) => model.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return Array.from(new Set(configured?.length ? configured : defaults));
}

export const GEMINI_MODELS = configuredModels("GEMINI_MODELS", [
  GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-3.5-flash",
]);
export const OPENAI_MODELS = configuredModels("OPENAI_MODELS", [OPENAI_MODEL, "gpt-5-mini"]);

export type ModelRole = "research" | "visual_finance";

function compactError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

function pooledModel(models: LanguageModelV4[], poolName: string): LanguageModelV4 {
  const primary = models[0];
  if (!primary) throw new Error(`No ${poolName} models are configured.`);

  return {
    specificationVersion: "v4",
    provider: "black-r-resilient",
    modelId: `${poolName}-automatic`,
    supportedUrls: primary.supportedUrls,
    async doGenerate(options) {
      let lastError: unknown;
      for (const [index, model] of models.entries()) {
        try {
          return await model.doGenerate(options);
        } catch (error) {
          if (options.abortSignal?.aborted) throw error;
          lastError = error;
          console.warn(
            `[ai] ${poolName} model ${index + 1}/${models.length} unavailable`,
            compactError(error),
          );
        }
      }
      throw lastError;
    },
    async doStream(options) {
      let lastError: unknown;
      for (const [index, model] of models.entries()) {
        try {
          return await model.doStream(options);
        } catch (error) {
          if (options.abortSignal?.aborted) throw error;
          lastError = error;
          console.warn(
            `[ai] ${poolName} stream ${index + 1}/${models.length} unavailable`,
            compactError(error),
          );
        }
      }
      throw lastError;
    },
  };
}

function geminiModels() {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) return [];
  const provider = createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey,
  });
  return GEMINI_MODELS.map((model) => provider(model));
}

function openAiModels() {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) return [];

  // GPT-5 must use the native Responses API. The generic chat-completions
  // adapter sends max_tokens, which GPT-5 rejects.
  const provider = createOpenAI({ apiKey });
  return OPENAI_MODELS.map((model) => provider.responses(model));
}

export function routedModel(role: ModelRole) {
  const gemini = geminiModels();
  const openai = openAiModels();

  if (role === "research") {
    const models = [...gemini, ...openai];
    if (models.length)
      return { model: pooledModel(models, "research"), provider: "Research and review workflow" };
    throw new Error(
      "AI is not configured. Add GEMINI_API_KEY and OPENAI_API_KEY as server secrets.",
    );
  }

  const models = [...openai, ...gemini];
  if (models.length)
    return { model: pooledModel(models, "design"), provider: "Design and calculation workflow" };
  throw new Error("AI is not configured. Add OPENAI_API_KEY and GEMINI_API_KEY as server secrets.");
}

export function modelConfiguration() {
  return {
    gemini: Boolean(process.env["GEMINI_API_KEY"]?.trim()),
    openai: Boolean(process.env["OPENAI_API_KEY"]?.trim()),
  };
}

export async function generateGeminiResearch(prompt: string) {
  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) return "";

  type ResearchPayload = {
    output_text?: string;
    steps?: {
      type?: string;
      content?: {
        type?: string;
        text?: string;
        annotations?: { url?: string; title?: string }[];
      }[];
    }[];
  };

  for (const [index, model] of GEMINI_MODELS.entries()) {
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: prompt,
            tools: [{ type: "google_search" }],
            generation_config: { thinking_level: "medium" },
          }),
        },
      );
      if (!response.ok) {
        console.warn(
          `[research] grounding model ${index + 1}/${GEMINI_MODELS.length} unavailable (${response.status})`,
        );
        continue;
      }

      const payload = (await response.json()) as ResearchPayload;
      if (payload.output_text?.trim()) return payload.output_text.trim();

      const assembled = (payload.steps ?? [])
        .flatMap((step) => step.content ?? [])
        .filter((item) => item.type === "text" && item.text)
        .map((item) => {
          const sources = (item.annotations ?? [])
            .filter((source) => source.url)
            .map((source) => `[${source.title || source.url}](${source.url})`)
            .join(", ");
          return `${item.text}${sources ? `\nSources: ${sources}` : ""}`;
        })
        .join("\n\n")
        .trim();
      if (assembled) return assembled;
    } catch (error) {
      console.warn(
        `[research] grounding model ${index + 1}/${GEMINI_MODELS.length} failed`,
        compactError(error),
      );
    }
  }

  return "";
}

export async function generateOpenAiImage(prompt: string) {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("Image generation needs OPENAI_API_KEY configured as a server secret.");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1536x1024",
      quality: "medium",
      output_format: "png",
    }),
  });

  const payload = (await response.json()) as {
    data?: { b64_json?: string; revised_prompt?: string }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI could not generate the visual.");
  }
  const image = payload.data?.[0];
  if (!image?.b64_json) throw new Error("OpenAI returned no image data.");

  return {
    dataUrl: `data:image/png;base64,${image.b64_json}`,
    revisedPrompt: image.revised_prompt || prompt,
    model: OPENAI_IMAGE_MODEL,
  };
}
