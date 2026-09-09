import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatWindow } from "@/components/chat/ChatWindow";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversation | Black R AI Business Plan Builder" },
      {
        name: "description",
        content:
          "Continue building your business plan or feasibility study with Black R AI and export it as DOCX or PDF.",
      },
      { property: "og:title", content: "Conversation | Black R AI" },
      {
        property: "og:description",
        content: "Your Black R AI business planning conversation and generated documents.",
      },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = useParams({ from: "/c/$threadId" });

  return (
    <ChatShell activeThreadId={threadId}>
      {({ renameThread }) => (
        <ThreadChat threadId={threadId} onTitle={(title) => void renameThread(threadId, title)} />
      )}
    </ChatShell>
  );
}

function ThreadChat({ threadId, onTitle }: { threadId: string; onTitle: (title: string) => void }) {
  const [messages, setMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    let active = true;
    setMessages(null);
    void supabase
      .from("messages")
      .select("id, role, parts")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error("[messages] load failed", error);
        setMessages(
          (data ?? []).map((row) => ({
            id: row.id,
            role: row.role as UIMessage["role"],
            parts: (row.parts ?? []) as UIMessage["parts"],
          })),
        );
      });
    return () => {
      active = false;
    };
  }, [threadId]);

  if (!messages) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ChatWindow
      key={threadId}
      threadId={threadId}
      initialMessages={messages}
      onFirstMessage={async () => threadId}
      onTitle={onTitle}
    />
  );
}
