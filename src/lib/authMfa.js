import { getSupabase } from "@/lib/supabaseClient";

/** Czy wymagany jest drugi faktor (TOTP) po haśle. */
export async function needsMfaStepUp() {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.currentLevel === "aal1" && data.nextLevel === "aal2";
}

/**
 * @param {string} factorId
 * @param {string} code
 */
export async function verifyMfaCode(factorId, code) {
  const sb = getSupabase();
  if (!sb) return { error: new Error("Brak Supabase.") };
  const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId });
  if (chErr) return { error: chErr };
  const { data, error } = await sb.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  return { data, error };
}

/** Aktywne faktory TOTP (do ekranu MFA). */
export async function listTotpFactors() {
  const sb = getSupabase();
  if (!sb) return { factors: [], error: new Error("Brak Supabase.") };
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) return { factors: [], error };
  const totp = data?.totp ?? [];
  return { factors: totp, error: null };
}
