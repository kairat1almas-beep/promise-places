import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicConfig } from "../config/publicConfig";

export type DbPromise = {
  id: number;
  user_id: string;
  couple_id: string | null;
  name: string;
  area: string;
  promised_at: string;
  planned_for: string | null;
  visited_at: string | null;
  priority: "Высокий" | "Средний" | "Нежный";
  status: "promised" | "planned" | "done";
  note: string;
  image: string;
  memory: string | null;
  memory_photo_url: string | null;
};

export type DbCouple = {
  id: string;
  created_by: string;
  display_name: string;
  invite_code: string;
  created_at: string;
};

export type DbCoupleMembership = {
  couple_id: string;
  user_id: string;
  role: "owner" | "partner";
  created_at: string;
};

let configFingerprint = "";

export let supabase: SupabaseClient | null = null;

export function refreshSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();
  const nextFingerprint = `${supabaseUrl ?? ""}::${supabaseAnonKey ?? ""}`;

  if (nextFingerprint === configFingerprint && supabase) {
    return supabase;
  }

  configFingerprint = nextFingerprint;
  supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
  return supabase;
}

refreshSupabaseClient();

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabaseClient = supabase ?? refreshSupabaseClient();
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

export async function signInWithEmail(email: string) {
  const supabaseClient = supabase ?? refreshSupabaseClient();
  if (!supabaseClient) throw new Error("Supabase is not configured");

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) throw error;
}

export async function signOut() {
  const supabaseClient = supabase ?? refreshSupabaseClient();
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}
