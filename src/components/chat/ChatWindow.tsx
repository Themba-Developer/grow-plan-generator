import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useNavigate } from "@tanstack/react-router";
import { FileText, ArrowUp, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { DocumentBuilder } from "@/components/chat/DocumentBuilder";

const STARTERS = [
  {
    title: "Full business plan",
    prompt:
      "I need a complete business plan. Here is my brief: a premium apparel manufacturing and supply company based in Harare, Zimbabwe, targeting corporate uniforms and schoolwear, seeking USD 250,000 in funding.",
  },
  {
    title: "Feasibility study",
    prompt:
      "Prepare a feasibility study brief with me for a 5,000 tonne per year cold storage facility in Lusaka, Zambia, capital budget USD 1.2 million.",
  },
  {
    title: "Financial projections",
    prompt:
      "Help me build 5-year financial projections with assumptions, break-even analysis and cash flow for a small manufacturing startup.",
  },
  {
    title: "Investor pitch review",
    prompt: "Review my business concept and tell me what an investor or bank will question first.",
  },
];

export function ChatWindow({
  threadId,
  initialMessages,
  onFirstMessage,
  onTitle,
}: {
  threadId: string | null;
  initialMessages: UIMessage[];
  onFirstMessage: (text: string) => Promise<string | null>;
  onTitle?: (title: string) => void;
}) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        body: () => ({ threadId }),
      }),
    [threadId],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: threadId ?? "new",
    messages: initialMessages,
    transport,
    onError: (error) => {
      console.error("[chat] error", error);
      toast.error(error.message || "The assistant could not respond. Please try again.");
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  const brief = useMemo(() => {
    const texts = messages
      .filter((message) => message.role === "user")
      .flatMap((message) =>
        message.parts.filter((part) => part.type === "text").map((part) => part.text),
      );
    return texts.join("\n\n").slice(0, 6000);
  }, [messages]);

  const submit = async (text: string) => {
    const value = text.trim();
    if (!value || isBusy) return;
    setInput("");

    if (!threadId) {
      const newId = await onFirstMessage(value);
      if (!newId) return;
      sessionStorage.setItem(`blackr:pending:${newId}`, value);
      void navigate({ to: "/c/$threadId", params: { threadId: newId } });
      return;
    }

    if (messages.length === 0) onTitle?.(value);
    void sendMessage({ text: value });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 pl-14 md:pl-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden font-medium text-foreground sm:inline">Black R AI</span>
          <span className="hidden sm:inline">·</span>
          <span>Business plans &amp; feasibility studies</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setBuilderOpen(true)}
          disabled={!brief}
        >
          <FileText className="size-4" />
          Build full document
        </Button>
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <BrandMark showWordmark={false} className="scale-125" />
              <h1 className="mt-6 font-display text-3xl font-bold">
                What are we building today?
              </h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                Describe your business or project and I will draft a complete 50–60 page business
                plan or feasibility study, ready to download as Word and PDF.
              </p>
              <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    onClick={() => void submit(starter.prompt)}
                    className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    <span className="block text-sm font-semibold">{starter.title}</span>
                    <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                      {starter.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => {
                const text = message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("");
                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.role === "assistant" ? (
                        <MessageResponse>{text}</MessageResponse>
                      ) : (
                        <p className="whitespace-pre-wrap">{text}</p>
                      )}
                    </MessageContent>
                  </Message>
                );
              })}
              {status === "submitted" && (
                <Shimmer className="text-sm">Analysing your brief...</Shimmer>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border bg-background px-4 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput
            onSubmit={(message, event) => {
              event.preventDefault();
              void submit(message.text || input);
            }}
          >
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Describe your business, market and funding needs..."
            />
            <PromptInputFooter className="justify-end">
              {isBusy ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  aria-label="Stop"
                  onClick={() => stop()}
                >
                  <Square />
                </Button>
              ) : (
                <PromptInputSubmit size="icon-sm" disabled={!input.trim()} aria-label="Send">
                  <ArrowUp />
                </PromptInputSubmit>
              )}
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Black R AI can make mistakes. Verify financial figures before submitting to lenders.
          </p>
        </div>
      </div>

      <DocumentBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        threadId={threadId}
        brief={brief}
      />
    </div>
  );
}
