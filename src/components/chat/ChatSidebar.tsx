import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare, Plus, Trash2, LogOut, PanelLeft, Search, X } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Thread } from "@/hooks/useThreads";

export function ChatSidebar({
  threads,
  activeThreadId,
  email,
  onDelete,
  onSignOut,
}: {
  threads: Thread[];
  activeThreadId?: string;
  email?: string;
  onDelete: (id: string) => void;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredThreads = threads.filter((thread) =>
    thread.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  const body = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-3 py-3">
        <BrandMark invert />
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X />
        </Button>
      </div>

      <div className="px-2">
        <Button
          variant="ghost"
          className="h-10 w-full justify-start gap-3 rounded-lg px-3 text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => {
            setOpen(false);
            void navigate({ to: "/" });
          }}
        >
          <Plus className="size-4" />
          New chat
        </Button>
        <label className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent focus-within:bg-sidebar-accent focus-within:text-sidebar-foreground">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chat history"
            className="min-w-0 flex-1 bg-transparent text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/45"
          />
        </label>
      </div>

      <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <p className="px-3 pb-2 text-xs font-medium text-sidebar-foreground/45">Chats</p>
        {filteredThreads.length === 0 && (
          <p className="px-2 text-xs text-sidebar-foreground/45">
            {query ? "No matching chats." : "No conversations yet."}
          </p>
        )}
        {filteredThreads.map((thread) => (
          <div
            key={thread.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg px-2 transition-colors",
              activeThreadId === thread.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            )}
          >
            <Link
              to="/c/$threadId"
              params={{ threadId: thread.id }}
              onClick={() => setOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 text-sm"
            >
              <MessageSquare className="size-4 shrink-0 text-sidebar-foreground/45" />
              <span className="truncate">{thread.title}</span>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete conversation"
              className="rounded-lg text-sidebar-foreground/40 opacity-0 hover:bg-sidebar-accent hover:text-primary focus:opacity-100 group-hover:opacity-100"
              onClick={() => onDelete(thread.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </nav>

      <div className="p-2">
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-sidebar-accent">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-black text-xs font-semibold text-white">
            {(email?.[0] || "U").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/65">
            {email}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            className="rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={onSignOut}
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[260px] shrink-0 md:block">{body}</aside>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Open menu"
        className="fixed left-3 top-3 z-40 md:hidden"
        onClick={() => setOpen(true)}
      >
        <PanelLeft />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-[280px] max-w-[85%]">{body}</div>
          <button
            type="button"
            aria-label="Close menu"
            className="flex-1 bg-black/50"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
