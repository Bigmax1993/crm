import React, { createContext, useContext, useMemo } from "react";

const AuthContext = createContext(null);

const disabled = () => ({ error: new Error("Logowanie jest wyłączone w tej aplikacji.") });

const defaultValue = {
  user: null,
  role: null,
  isAuthenticated: true,
  isLoadingAuth: false,
  isLoadingPublicSettings: false,
  authError: null,
  appPublicSettings: { id: "local" },
  authMode: "none",
  pendingMfaVerification: false,
  passwordRecoveryMode: false,
  needsEmailConfirmation: false,
  logout: async () => {},
  navigateToLogin: () => {},
  checkAppState: async () => {},
  signInWithPassword: async () => disabled(),
  signUp: async () => disabled(),
  signInWithOAuth: async () => disabled(),
  signInWithMagicLink: async () => disabled(),
  resetPasswordForEmail: async () => disabled(),
  updatePassword: async () => disabled(),
  resendSignupEmail: async () => disabled(),
  refreshMfaPending: async () => {},
};

export function AuthProvider({ children }) {
  const value = useMemo(() => defaultValue, []);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
