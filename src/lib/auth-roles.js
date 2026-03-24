/** @typedef {'admin' | 'user'} AppRole */

export const ROLE = {
  ADMIN: "admin",
  USER: "user",
};

/** Strony widoczne tylko dla administratora (role w user_metadata / app_metadata w Supabase). */
export const ADMIN_ONLY_PAGES = new Set(["Settings", "SettingsAI"]);

/**
 * @param {{ user_metadata?: object, app_metadata?: object } | null | undefined} user
 * @returns {AppRole | null} null = brak metadanych — traktuj jak pełny dostęp w UI.
 */
export function roleFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const appMeta = user.app_metadata ?? {};
  const r = meta.role ?? appMeta.role;
  if (r === ROLE.ADMIN) return ROLE.ADMIN;
  if (r === ROLE.USER) return ROLE.USER;
  return ROLE.USER;
}

/**
 * @param {string} pageName
 * @param {AppRole | null} role
 */
export function canAccessPage(pageName, role) {
  if (!ADMIN_ONLY_PAGES.has(pageName)) return true;
  if (role == null) return true;
  return role === ROLE.ADMIN;
}
