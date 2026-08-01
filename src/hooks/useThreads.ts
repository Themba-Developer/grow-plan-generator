import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Thread = {
  id: string;
  title: string;
  doc_type: string;
  updated_at: string;
};

export function useThreads(userId: string | undefined) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setThreads([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("threads")
      .select("id, title, doc_type, updated_at")
      .order("updated_at", { ascending: false });
    if (error) console.error("[threads] load failed", error);
    setThreads(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createThread = useCallback(
    async (title: string, docType = "chat") => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("threads")
        .insert({ user_id: userId, title: title.slice(0, 90) || "New chat", doc_type: docType })
        .select("id, title, doc_type, updated_at")
        .single();
      if (error) {
        console.error("[threads] create failed", error);
        return null;
      }
      setThreads((prev) => [data, ...prev]);
      return data;
    },
    [userId],
  );

  const renameThread = useCallback(async (id: string, title: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    const { error } = await supabase.from("threads").update({ title }).eq("id", id);
    if (error) console.error("[threads] rename failed", error);
  }, []);

  const deleteThread = useCallback(async (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("threads").delete().eq("id", id);
    if (error) console.error("[threads] delete failed", error);
  }, []);

  return { threads, loading, refresh, createThread, renameThread, deleteThread };
}
