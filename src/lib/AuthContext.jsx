import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { createAxiosClient } from "@base44/sdk/dist/utils/axios-client";
import { createAbsolutePageHref } from "@/utils";
import { getAuthRedirectToPath } from "@/lib/authRedirect";
import { isSupabaseAuthEnabled, isDevSkipAuth as devSkipAuth } from "@/lib/authConfig";
import { getSupabase, resetSupabaseClient, setRememberMePreference } from "@/lib/supabaseClient";
import { roleFromUser } from "@/lib/auth-roles";
import { needsMfaStepUp } from "@/lib/authMfa";
import {
  assignSpaRootUrl,
  canUseBase44RemoteLogout,
  clearBase44BrowserSession,
} from "@/lib/base44ClientLogout";

const AuthContext = createContext();

const supabaseAuthEnabled = isSupabaseAuthEnabled();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  /** Po zalogowaniu hasłem — wymagany kod TOTP (MFA). */
  const [pendingMfaVerification, setPendingMfaVerification] = useState(false);
  /** Link resetu hasła — wymuś ekran nowego hasła zamiast CRM. */
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  /**
   * Po `resetSupabaseClient()` (np. zmiana localStorage vs sessionStorage przy „Zapamiętaj mnie”)
   * trzeba odpiąć `onAuthStateChange` od starego klienta i podpiąć pod nowy — inaczej logowanie
   * nie aktualizuje `user` / `isAuthenticated`.
   */
  const [supabaseAuthSubscriptionKey, setSupabaseAuthSubscriptionKey] = useState(0);

  const authMode = useMemo(() => {
    if (devSkipAuth()) return "dev-skip";
    if (supabaseAuthEnabled) return "supabase";
    return "base44";
  }, []);

  const role = useMemo(() => {
    if (authMode !== "supabase") return null;
    return roleFromUser(user);
  }, [authMode, user]);

  const needsEmailConfirmation = useMemo(() => {
    if (authMode !== "supabase" || !user) return false;
    return user.email_confirmed_at == null;
  }, [authMode, user]);

  useEffect(() => {
    checkAppState();
  }, []);

  const applySupabaseUser = useCallback((sessionUser) => {
    if (sessionUser) {
      setUser(sessionUser);
      setIsAuthenticated(true);
      setAppPublicSettings({ id: "supabase" });
      setAuthError(null);
    } else {
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  const refreshMfaPending = useCallback(async () => {
    if (!supabaseAuthEnabled || devSkipAuth()) {
      setPendingMfaVerification(false);
      return;
    }
    const step = await needsMfaStepUp();
    setPendingMfaVerification(step);
  }, []);

  useLayoutEffect(() => {
    if (!supabaseAuthEnabled || devSkipAuth()) return undefined;

    const sb = getSupabase();
    if (!sb) {
      setIsLoadingAuth(false);
      return undefined;
    }

    let cancelled = false;

    const init = async () => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (cancelled) return;
      applySupabaseUser(session?.user ?? null);
      setIsLoadingAuth(false);
      if (session?.user) {
        await refreshMfaPending();
      }
    };

    init();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryMode(true);
      }
      applySupabaseUser(session?.user ?? null);
      if (session?.user) {
        await refreshMfaPending();
      } else {
        setPendingMfaVerification(false);
        setPasswordRecoveryMode(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySupabaseUser, refreshMfaPending, supabaseAuthSubscriptionKey]);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      if (devSkipAuth()) {
        setAppPublicSettings({ id: appParams.appId || "dev" });
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        return;
      }

      if (supabaseAuthEnabled) {
        setIsLoadingPublicSettings(false);
        setAuthError(null);
        return;
      }

      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          "X-App-Id": appParams.appId,
        },
        token: appParams.token,
        interceptResponses: true,
      });

      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);

        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error("App state check failed:", appError);

        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === "auth_required") {
            setAuthError({
              type: "auth_required",
              message: "Authentication required",
            });
          } else if (reason === "user_not_registered") {
            setAuthError({
              type: "user_not_registered",
              message: "User not registered for this app",
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message,
            });
          }
        } else {
          setAuthError({
            type: "unknown",
            message: appError.message || "Failed to load app",
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      setAuthError({
        type: "unknown",
        message: error.message || "An unexpected error occurred",
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error("User auth check failed:", error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: "auth_required",
          message: "Authentication required",
        });
      }
    }
  };

  const signInWithPassword = useCallback(
    async (email, password, options = {}) => {
      const { rememberMe = true } = options;
      setRememberMePreference(rememberMe);
      resetSupabaseClient();
      flushSync(() => {
        setSupabaseAuthSubscriptionKey((k) => k + 1);
      });
      const sb = getSupabase();
      if (!sb) {
        return { error: new Error("Brak konfiguracji Supabase.") };
      }
      const result = await sb.auth.signInWithPassword({ email, password });
      if (!result.error && result.data?.session?.user) {
        applySupabaseUser(result.data.session.user);
      }
      if (!result.error) {
        setPasswordRecoveryMode(false);
        await refreshMfaPending();
      }
      return result;
    },
    [applySupabaseUser, refreshMfaPending]
  );

  const signUp = useCallback(async (email, password) => {
    const sb = getSupabase();
    if (!sb) {
      return { error: new Error("Brak konfiguracji Supabase.") };
    }
    return sb.auth.signUp({
      email,
      password,
      options: {
        data: { role: "user" },
        emailRedirectTo: getAuthRedirectToPath("Login"),
      },
    });
  }, []);

  const signInWithOAuth = useCallback(
    async (provider) => {
      const sb = getSupabase();
      if (!sb) {
        return { error: new Error("Brak konfiguracji Supabase.") };
      }
      return sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthRedirectToPath("Login"),
          skipBrowserRedirect: false,
        },
      });
    },
    []
  );

  const signInWithMagicLink = useCallback(async (email) => {
    const sb = getSupabase();
    if (!sb) {
      return { error: new Error("Brak konfiguracji Supabase.") };
    }
    return sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthRedirectToPath("Login"),
        shouldCreateUser: true,
      },
    });
  }, []);

  const resetPasswordForEmail = useCallback(async (email) => {
    const sb = getSupabase();
    if (!sb) {
      return { error: new Error("Brak konfiguracji Supabase.") };
    }
    return sb.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectToPath("ResetPassword"),
    });
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const sb = getSupabase();
    if (!sb) {
      return { error: new Error("Brak konfiguracji Supabase.") };
    }
    const result = await sb.auth.updateUser({ password: newPassword });
    if (!result.error) {
      setPasswordRecoveryMode(false);
    }
    return result;
  }, []);

  const resendSignupEmail = useCallback(async (email) => {
    const sb = getSupabase();
    if (!sb) {
      return { error: new Error("Brak konfiguracji Supabase.") };
    }
    return sb.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: getAuthRedirectToPath("Login"),
      },
    });
  }, []);

  const logout = useCallback(
    async (shouldRedirect = true) => {
      if (supabaseAuthEnabled) {
        const sb = getSupabase();
        if (sb) {
          try {
            await sb.auth.signOut();
          } catch (e) {
            console.error("Supabase signOut failed:", e);
          }
        }
        setUser(null);
        setIsAuthenticated(false);
        setPendingMfaVerification(false);
        setPasswordRecoveryMode(false);
        if (shouldRedirect) {
          window.location.assign(createAbsolutePageHref("Login"));
        }
        return;
      }

      setUser(null);
      setIsAuthenticated(false);

      if (canUseBase44RemoteLogout()) {
        if (shouldRedirect) {
          base44.auth.logout(window.location.href);
        } else {
          base44.auth.logout();
        }
        return;
      }

      clearBase44BrowserSession();
      if (shouldRedirect) {
        assignSpaRootUrl();
      }
    },
    []
  );

  const navigateToLogin = useCallback(() => {
    if (supabaseAuthEnabled) {
      window.location.assign(createAbsolutePageHref("Login"));
      return;
    }
    if (canUseBase44RemoteLogout()) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }
    assignSpaRootUrl();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authMode,
        pendingMfaVerification,
        passwordRecoveryMode,
        needsEmailConfirmation,
        logout,
        navigateToLogin,
        checkAppState,
        signInWithPassword,
        signUp,
        signInWithOAuth,
        signInWithMagicLink,
        resetPasswordForEmail,
        updatePassword,
        resendSignupEmail,
        refreshMfaPending,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
