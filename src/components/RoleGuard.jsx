import React from "react";
import { canAccessPage } from "@/lib/auth-roles";

/**
 * Wcześniej ograniczał strony wg roli Supabase. Logowanie wyłączone — zawsze renderujemy trasę.
 */
export function RoleGuard({ children, pageName }) {
  if (!canAccessPage(pageName, null)) {
    return (
      <div className="mx-auto mt-8 max-w-xl rounded-lg border border-slate-300 bg-white p-5 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <h2 className="mb-2 text-lg font-semibold">Brak dostepu</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Ta sekcja jest dostepna tylko w trybie administracyjnym.
        </p>
      </div>
    );
  }
  return children;
}
