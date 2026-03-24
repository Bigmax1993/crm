import React, { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { CurrencyDisplayProvider } from '@/contexts/CurrencyDisplayContext';
import { appParams } from '@/lib/app-params';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ConfirmEmail from '@/pages/ConfirmEmail';
import MfaChallenge from '@/pages/MfaChallenge';
import { RoleGuard } from '@/components/RoleGuard';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const routerBasename = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || undefined;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

/** Gdy Base44 wymaga logowania: wcześniej zwracano `null` → biały ekran, jeśli redirect się nie uda (brak VITE_BASE44_APP_BASE_URL). */
function AuthRequiredScreen({ navigateToLogin }) {
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    if (appParams.appBaseUrl) {
      tried.current = true;
      navigateToLogin();
    }
  }, [navigateToLogin]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">Wymagane logowanie Base44</h1>
        {!appParams.appBaseUrl ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            Brak adresu aplikacji. Utwórz plik <code className="text-foreground">.env</code> w katalogu projektu i ustaw np.{" "}
            <code className="text-foreground">VITE_BASE44_APP_BASE_URL=https://twoja-aplikacja.base44.app</code>
            oraz <code className="text-foreground">VITE_BASE44_APP_ID=…</code>, potem zrestartuj <code className="text-foreground">npm run dev</code>.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Przekierowywanie do logowania…</p>
        )}
        <p className="text-muted-foreground text-xs leading-relaxed">
          Tylko podgląd UI bez API: w <code className="text-foreground">.env</code> ustaw <code className="text-foreground">VITE_DEV_SKIP_AUTH=true</code> (tryb deweloperski).
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => navigateToLogin()}
        >
          Otwórz logowanie
        </button>
      </div>
    </div>
  );
}

const AuthenticatedApp = () => {
  const {
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    navigateToLogin,
    isAuthenticated,
    authMode,
    pendingMfaVerification,
    passwordRecoveryMode,
    needsEmailConfirmation,
  } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Handle authentication errors (tryb Base44 — nie ekran logowania Supabase)
  if (authMode !== "supabase" && authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <AuthRequiredScreen navigateToLogin={navigateToLogin} />;
    }
  }

  // Logowanie Supabase — brak sesji: Login, rejestracja, reset hasła
  if (authMode === "supabase" && !isAuthenticated) {
    return (
      <Routes>
        <Route path="/Login" element={<Login />} />
        <Route path="/Register" element={<Register />} />
        <Route path="/ForgotPassword" element={<ForgotPassword />} />
        <Route path="/ResetPassword" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/Login" replace />} />
      </Routes>
    );
  }

  // Reset hasła — sesja recovery (link z e-maila)
  if (authMode === "supabase" && isAuthenticated && passwordRecoveryMode) {
    return (
      <Routes>
        <Route path="/ResetPassword" element={<ResetPassword />} />
        <Route path="*" element={<Navigate to="/ResetPassword" replace />} />
      </Routes>
    );
  }

  // MFA (TOTP) — drugi krok po haśle
  if (authMode === "supabase" && isAuthenticated && pendingMfaVerification) {
    return (
      <Routes>
        <Route path="/MfaChallenge" element={<MfaChallenge />} />
        <Route path="*" element={<Navigate to="/MfaChallenge" replace />} />
      </Routes>
    );
  }

  // Potwierdzenie adresu e-mail (wymagane w projekcie Supabase)
  if (authMode === "supabase" && isAuthenticated && needsEmailConfirmation) {
    return (
      <Routes>
        <Route path="/ConfirmEmail" element={<ConfirmEmail />} />
        <Route path="*" element={<Navigate to="/ConfirmEmail" replace />} />
      </Routes>
    );
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/Login" element={<Navigate to="/" replace />} />
      <Route path="/Register" element={<Navigate to="/" replace />} />
      <Route path="/ForgotPassword" element={<Navigate to="/" replace />} />
      <Route path="/ResetPassword" element={<Navigate to="/" replace />} />
      <Route path="/MfaChallenge" element={<Navigate to="/" replace />} />
      <Route path="/ConfirmEmail" element={<Navigate to="/" replace />} />
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <RoleGuard pageName={mainPageKey}>
            <MainPage />
          </RoleGuard>
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <RoleGuard pageName={path}>
                <Page />
              </RoleGuard>
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <CurrencyDisplayProvider>
            <Router basename={routerBasename}>
              <NavigationTracker />
              <AuthenticatedApp />
            </Router>
            <Toaster />
            <SonnerToaster richColors position="top-right" closeButton />
          </CurrencyDisplayProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
