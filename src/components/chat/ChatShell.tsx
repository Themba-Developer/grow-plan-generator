import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useThreads, type Thread } from "@/hooks/useThreads";
import { ChatSidebar } from "@/components/chat/ChatSidebar";

export function ChatShell({
  activeThreadId,
  children,
}: {
  activeThreadId?: string;
  children: (helpers: {
    userId: string;
    threads: Thread[];
    createThread: (title: string, docType?: string) => Promise<Thread | null>;
    renameThread: (id: string, title: string) => Promise<void>;
  }) => ReactNode;
}) {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const { threads, createThread, renameThread, deleteThread } = useThreads(user?.id);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!loading && !user && !redirecting) {
      setRedirecting(true);
      void navigate({ to: "/auth" });
    }
  }, [loading, user, redirecting, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ChatSidebar
        threads={threads}
        {...(activeThreadId ? { activeThreadId } : {})}
        {...(user.email ? { email: user.email } : {})}
        onDelete={(id) => {
          void deleteThread(id);
          if (id === activeThreadId) void navigate({ to: "/" });
        }}
        onSignOut={() => {
          void signOut().then(() => navigate({ to: "/auth" }));
        }}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {children({ userId: user.id, threads, createThread, renameThread })}
      </main>
    </div>
  );
}
