import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { SYSTEM_PROMPT } from "@/lib/prompts.server";
import { routedModel } from "@/lib/model-router.server";
import { getUserFromRequest } from "@/lib/request-auth.server";
import { friendlyAiError } from "@/lib/ai-errors";

type ChatRequestBody = { messages?: unknown; threadId?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let auth;
        try {
          auth = await getUserFromRequest(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Authentication unavailable";
          return new Response(message, { status: 503 });
        }
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        const threadId = typeof body.threadId === "string" ? body.threadId : null;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const hasGemini = Boolean(process.env["GEMINI_API_KEY"]?.trim());
        const hasOpenAi = Boolean(process.env["OPENAI_API_KEY"]?.trim());
        if (!hasGemini && !hasOpenAi) {
          return new Response(
            "AI is not configured. Add GEMINI_API_KEY or OPENAI_API_KEY as a server secret.",
            { status: 500 },
          );
        }

        if (threadId) {
          const { data: thread } = await auth.supabase
            .from("threads")
            .select("id")
            .eq("id", threadId)
            .maybeSingle();
          if (!thread) return new Response("Thread not found", { status: 404 });
        }

        const uiMessages = messages as UIMessage[];
        const selectedModel = routedModel("research").model;

        const result = streamText({
          model: selectedModel,
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(uiMessages),
          providerOptions: {
            openai: { reasoningEffort: "low", textVerbosity: "medium" },
          },
          onError: ({ error }) => console.error("[chat] stream error", error),
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
          onError: (error) => friendlyAiError(error),
          onFinish: async ({ responseMessage }) => {
            if (!threadId) return;
            const last = uiMessages[uiMessages.length - 1];
            const rows: {
              thread_id: string;
              user_id: string;
              role: string;
              parts: unknown;
              sdk_message_id: string | null;
            }[] = [];

            if (last?.role === "user") {
              rows.push({
                thread_id: threadId,
                user_id: auth.userId,
                role: "user",
                parts: last.parts,
                sdk_message_id: last.id ?? null,
              });
            }
            if (responseMessage) {
              rows.push({
                thread_id: threadId,
                user_id: auth.userId,
                role: "assistant",
                parts: responseMessage.parts,
                sdk_message_id: responseMessage.id ?? null,
              });
            }
            if (!rows.length) return;

            const messageIds = rows
              .map((row) => row.sdk_message_id)
              .filter((id): id is string => Boolean(id));
            const existingIds = new Set<string>();

            if (messageIds.length) {
              const { data: existing, error: lookupError } = await auth.supabase
                .from("messages")
                .select("sdk_message_id")
                .eq("thread_id", threadId)
                .in("sdk_message_id", messageIds);
              if (lookupError) {
                console.error("[chat] failed to check persisted messages", lookupError);
              } else {
                for (const row of existing ?? []) {
                  if (row.sdk_message_id) existingIds.add(row.sdk_message_id);
                }
              }
            }

            const pendingRows = rows.filter(
              (row) => !row.sdk_message_id || !existingIds.has(row.sdk_message_id),
            );
            if (pendingRows.length) {
              const { error } = await auth.supabase.from("messages").insert(pendingRows as never);
              if (error) console.error("[chat] failed to persist messages", error);
            }

            const { error: touchError } = await auth.supabase
              .from("threads")
              .update({ updated_at: new Date().toISOString() } as never)
              .eq("id", threadId);
            if (touchError) console.error("[chat] failed to touch thread", touchError);
          },
        });

        return response;
      },
    },
  },
});
