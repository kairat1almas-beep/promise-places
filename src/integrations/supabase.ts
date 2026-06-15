import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signInWithEmail(email: string) {
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
