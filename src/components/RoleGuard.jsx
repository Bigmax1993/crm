import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { canAccessPage } from "@/lib/auth-roles";
import { createPageUrl } from "@/utils";

/**
 * Ogranicza dostęp do tras wymagających roli admin (gdy włączone jest logowanie Supabase).
 */
export function RoleGuard({ pageName, children }) {
  const { role } = useAuth();
  if (!canAccessPage(pageName, role)) {
    return <Navigate to={createPageUrl("CEODashboard")} replace />;
  }
  return children;
}
