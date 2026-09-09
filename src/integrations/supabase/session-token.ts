import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";

const VALIDATION_TTL_MS = 60_000;
const REFRESH_WINDOW_SECONDS = 90;

let validatedToken: string | null = null;
let validatedAt = 0;

function isExpiring(session: Session) {
  return !session.expires_at || session.expires_at <= Date.now() / 1000 + REFRESH_WINDOW_SECONDS;
}

async function refreshSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return data.session;
}

/** Returns a fresh, Supabase-verified user JWT for API routes and server functions. */
export async function getSupabaseAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Could not read your sign-in session. Please try again.");

  let session = data.session;
  if (!session) throw new Error("Your session has expired. Please sign in again.");
  if (isExpiring(session)) session = await refreshSession();

  if (validatedToken === session.access_token && Date.now() - validatedAt < VALIDATION_TTL_MS) {
    return session.access_token;
  }

  let validation = await supabase.auth.getUser(session.access_token);
  if (validation.error || !validation.data.user) {
    session = await refreshSession();
    validation = await supabase.auth.getUser(session.access_token);
  }
  if (validation.error || !validation.data.user) {
    throw new Error("Your session is no longer valid. Please sign in again.");
  }

  validatedToken = session.access_token;
  validatedAt = Date.now();
  return session.access_token;
}

export function clearSupabaseTokenValidation() {
  validatedToken = null;
  validatedAt = 0;
}
