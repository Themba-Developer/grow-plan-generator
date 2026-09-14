import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Verifies the bearer token on an incoming request and returns a Supabase
 * client that acts as that user (RLS applies).
 */
export async function getUserFromRequest(request: Request) {
  // The browser-facing values are safe to use here: a Supabase URL and
  // publishable key are public identifiers, and RLS still authorises the user.
  // Some hosts expose VITE_* values at build time but do not duplicate them as
  // Worker runtime bindings, so accept either naming convention.
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error(
      "Backend is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or their VITE_ equivalents).",
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.split(".").length !== 3) return null;

  const supabase = createClient<Database>(url, key, {
    global: {
      fetch: createSupabaseFetch(key),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    console.error("[Supabase auth] API token verification failed", {
      name: error.name,
      status: error.status,
      code: error.code,
      message: error.message,
    });
    if (!error.status || error.status >= 500 || /fetch/i.test(error.name)) {
      throw new Error("Supabase authentication is temporarily unavailable. Please try again.");
    }
  }
  if (error || !data.user) return null;

  return { supabase, userId: data.user.id };
}
