import React from "react";

/**
 * Wcześniej ograniczał strony wg roli Supabase. Logowanie wyłączone — zawsze renderujemy trasę.
 */
export function RoleGuard({ children }) {
  return children;
}
