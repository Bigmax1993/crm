import { createClient } from "@supabase/supabase-js";

let client;

const STORAGE_PREF_KEY = "fakturowo_supabase_storage";

/** local = „zapamiętaj mnie”; session = sesja do zamknięcia karty */
export function getRememberMePreference() {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(STORAGE_PREF_KEY);
  if (v === null) return true;
  return v === "local";
}

export function setRememberMePreference(rememberMe) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_PREF_KEY, rememberMe ? "local" : "session");
}

export function resetSupabaseClient() {
  client = null;
}

/**
 * Klient Supabase (singleton). Zwraca null, gdy brak zmiennych środowiskowych.
 * Pamięć sesji: localStorage (zapamiętaj) lub sessionStorage — ustawiane przed logowaniem.
 */
export function getSupabase() {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;

  const remember = getRememberMePreference();
  const storage =
    typeof window !== "undefined" ? (remember ? window.localStorage : window.sessionStorage) : undefined;

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage,
    },
  });
  return client;
}
