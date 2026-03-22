import React, { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { CurrencyDisplayProvider } from '@/contexts/CurrencyDisplayContext';
import { appParams } from '@/lib/app-params';

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
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <AuthRequiredScreen navigateToLogin={navigateToLogin} />;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
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
