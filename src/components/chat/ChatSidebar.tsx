import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare, Plus, Trash2, LogOut, PanelLeft, X } from "lucide-react";
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

  const body = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between px-4 py-4">
        <BrandMark invert />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X />
        </Button>
      </div>

      <div className="px-3">
        <Button
          className="w-full justify-start gap-2"
          onClick={() => {
            setOpen(false);
            void navigate({ to: "/" });
          }}
        >
          <Plus className="size-4" />
          New document chat
        </Button>
      </div>

      <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
          History
        </p>
        {threads.length === 0 && (
          <p className="px-2 text-xs text-sidebar-foreground/45">No conversations yet.</p>
        )}
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={cn(
              "group flex items-center gap-1 rounded-md px-2 transition-colors",
              activeThreadId === thread.id
                ? "bg-sidebar-accent"
                : "hover:bg-sidebar-accent/60",
            )}
          >
            <Link
              to="/c/$threadId"
              params={{ threadId: thread.id }}
              onClick={() => setOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 text-sm"
            >
              <MessageSquare className="size-3.5 shrink-0 text-sidebar-foreground/45" />
              <span className="truncate">{thread.title}</span>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete conversation"
              className="text-sidebar-foreground/40 opacity-0 hover:bg-sidebar-accent hover:text-primary group-hover:opacity-100"
              onClick={() => onDelete(thread.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-sidebar-foreground/55">{email}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
      <aside className="hidden w-[264px] shrink-0 border-r border-sidebar-border md:block">
        {body}
      </aside>

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
