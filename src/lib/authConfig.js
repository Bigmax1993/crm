/**
 * Konfiguracja trybu uwierzytelniania (Base44 vs Supabase vs dev).
 */
export function isSupabaseAuthEnabled() {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() &&
      import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  );
}

export function isDevSkipAuth() {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_AUTH === "true";
}
