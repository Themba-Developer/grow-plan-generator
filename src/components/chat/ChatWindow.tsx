import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUp,
  FileText,
  ImagePlus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { getSupabaseAccessToken } from "@/integrations/supabase/session-token";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { friendlyAiError } from "@/lib/ai-errors";

const DocumentBuilder = lazy(() =>
  import("@/components/chat/DocumentBuilder").then((module) => ({
    default: module.DocumentBuilder,
  })),
);
const VisualStudio = lazy(() =>
  import("@/components/chat/VisualStudio").then((module) => ({
    default: module.VisualStudio,
  })),
);

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
    title: "Project proposal",
    prompt:
      "Help me create a professional funding proposal with objectives, implementation plan, budget, risks and measurable outcomes.",
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
  const [visualOpen, setVisualOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSent = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async () => {
          const token = await getSupabaseAccessToken();
          return { Authorization: `Bearer ${token}` };
        },
        body: () => ({ threadId }),
      }),
    [threadId],
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    error: chatError,
    regenerate,
    clearError,
  } = useChat({
    id: threadId ?? "new",
    messages: initialMessages,
    transport,
    onError: (error) => {
      console.error("[chat] error", error);
      toast.error(friendlyAiError(error));
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  useEffect(() => {
    if (!threadId) return;
    const key = `blackr:pending:${threadId}`;
    if (pendingSent.current === key) return;
    const pending = sessionStorage.getItem(key);
    if (!pending) return;
    pendingSent.current = key;
    sessionStorage.removeItem(key);
    void sendMessage({ text: pending });
  }, [threadId, sendMessage]);

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
    clearError();

    if (!threadId) {
      const newId = await onFirstMessage(value);
      if (!newId) {
        setInput(value);
        toast.error("A new chat could not be created. Please try again.");
        return;
      }
      sessionStorage.setItem(`blackr:pending:${newId}`, value);
      void navigate({ to: "/c/$threadId", params: { threadId: newId } });
      return;
    }

    if (messages.length === 0) onTitle?.(value);
    void sendMessage({ text: value });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="relative z-10 flex h-14 items-center justify-between gap-3 bg-background/90 px-3 pl-14 backdrop-blur md:px-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">Black R AI</span>
          <span className="hidden text-muted-foreground sm:inline">Business workspace</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 rounded-lg"
            onClick={() => setVisualOpen(true)}
          >
            <ImagePlus className="size-4" />
            <span className="hidden sm:inline">Create visual</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-lg shadow-none"
            onClick={() => setBuilderOpen(true)}
            disabled={!brief}
          >
            <FileText className="size-4" />
            Build document
          </Button>
        </div>
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-[768px] px-4 pb-10 pt-5 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[58vh] flex-col items-center justify-center py-10 text-center">
              <BrandMark showWordmark={false} className="scale-125" />
              <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight">
                What can I help you create?
              </h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                Research, calculate and create premium documents and visuals from one conversation.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
                  <Sparkles className="size-3 text-primary" />
                  Current research
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
                  <ShieldCheck className="size-3 text-primary" />
                  Independent quality checks
                </span>
              </div>
              <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    onClick={() => void submit(starter.prompt)}
                    className="rounded-2xl border border-border/80 bg-background p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-muted"
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
            <div className="space-y-7">
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
              {status === "submitted" && <Shimmer className="text-sm">Working on it...</Shimmer>}
              {chatError && (
                <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Response interrupted</p>
                    <p className="mt-1 text-muted-foreground">{friendlyAiError(chatError)}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2 rounded-lg bg-background shadow-none"
                      onClick={() => {
                        clearError();
                        void regenerate();
                      }}
                    >
                      <RotateCcw className="size-3.5" />
                      Retry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="bg-gradient-to-t from-background via-background to-background/0 px-3 pb-3 pt-5 sm:px-4">
        <div className="mx-auto w-full max-w-[768px]">
          <PromptInput
            className="[&_[data-slot=input-group]]:rounded-[28px] [&_[data-slot=input-group]]:border-border/80 [&_[data-slot=input-group]]:bg-background [&_[data-slot=input-group]]:shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
            onSubmit={(message, event) => {
              event.preventDefault();
              void submit(message.text || input);
            }}
          >
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Message Black R AI"
              className="min-h-14 px-4 pb-1 pt-3.5 text-[15px]"
            />
            <PromptInputFooter className="justify-end px-2 pb-2 pt-1">
              {isBusy ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="rounded-full"
                  aria-label="Stop"
                  onClick={() => stop()}
                >
                  <Square />
                </Button>
              ) : (
                <PromptInputSubmit
                  className="rounded-full"
                  size="icon-sm"
                  disabled={!input.trim()}
                  aria-label="Send"
                >
                  <ArrowUp />
                </PromptInputSubmit>
              )}
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            AI can make mistakes. Verify legal, financial and engineering outputs before relying on
            them.
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        {builderOpen ? (
          <DocumentBuilder
            open={builderOpen}
            onOpenChange={setBuilderOpen}
            threadId={threadId}
            brief={brief}
          />
        ) : null}
        {visualOpen ? (
          <VisualStudio open={visualOpen} onOpenChange={setVisualOpen} context={brief || input} />
        ) : null}
      </Suspense>
    </div>
  );
}
