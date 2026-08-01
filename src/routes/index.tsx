import { createFileRoute } from "@tanstack/react-router";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatWindow } from "@/components/chat/ChatWindow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Black R AI | Business Plan & Feasibility Study Builder" },
      {
        name: "description",
        content:
          "Black R AI writes complete 50-60 page business plans and feasibility studies with financial projections, then exports polished DOCX and PDF documents.",
      },
      { property: "og:title", content: "Black R AI | Business Plan Builder" },
      {
        property: "og:description",
        content:
          "Generate investor-ready business plans and feasibility studies, downloadable as Word and PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewChatPage,
});

function NewChatPage() {
  return (
    <ChatShell>
      {({ createThread }) => (
        <ChatWindow
          threadId={null}
          initialMessages={[]}
          onFirstMessage={async (text) => {
            const thread = await createThread(text.slice(0, 60));
            return thread?.id ?? null;
          }}
        />
      )}
    </ChatShell>
  );
}
