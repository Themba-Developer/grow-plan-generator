import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";
import { CHAT_MODEL, SYSTEM_PROMPT } from "@/lib/prompts.server";
import { getUserFromRequest } from "@/lib/request-auth.server";

type ChatRequestBody = { messages?: unknown; threadId?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await getUserFromRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        const threadId = typeof body.threadId === "string" ? body.threadId : null;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured", { status: 500 });

        if (threadId) {
          const { data: thread } = await auth.supabase
            .from("threads")
            .select("id")
            .eq("id", threadId)
            .maybeSingle();
          if (!thread) return new Response("Thread not found", { status: 404 });
        }

        const uiMessages = messages as UIMessage[];
        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(apiKey, initialRunId);

        const result = streamText({
          model: gateway(CHAT_MODEL),
          system: SYSTEM_PROMPT,
          messages: convertToModelMessages(uiMessages),
          onError: ({ error }) => console.error("[chat] stream error", error),
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
          headers: getLovableAiGatewayResponseHeaders(undefined, {
            ...(initialRunId ? { "X-Lovable-AIG-Run-ID": initialRunId } : {}),
          }),
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

            const { error } = await auth.supabase.from("messages").insert(rows as never);
            if (error) console.error("[chat] failed to persist messages", error);

            const { error: touchError } = await auth.supabase
              .from("threads")
              .update({ updated_at: new Date().toISOString() } as never)
              .eq("id", threadId);
            if (touchError) console.error("[chat] failed to touch thread", touchError);
          },
        });

        return withLovableAiGatewayRunIdHeader(response, gateway);
      },
    },
  },
});
