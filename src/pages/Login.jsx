import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Pierwszy ekran: wybór metody; potem formularz hasła lub magic link. */
export default function Login() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    signInWithPassword,
    signInWithOAuth,
    signInWithMagicLink,
    authMode,
    navigateToLogin,
  } = useAuth();

  const [step, setStep] = useState("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState(null);
  const [magicInfo, setMagicInfo] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const s = searchParams.get("step");
    if (s === "password" || s === "magic") {
      setStep(s);
    } else {
      setStep("choose");
    }
  }, [searchParams]);

  const goChoose = () => {
    setStep("choose");
    setError(null);
    setMagicInfo(null);
    setSearchParams({}, { replace: true });
  };

  const goPassword = () => {
    setStep("password");
    setError(null);
    setSearchParams({ step: "password" }, { replace: true });
  };

  const goMagic = () => {
    setStep("magic");
    setError(null);
    setMagicInfo(null);
    setSearchParams({ step: "magic" }, { replace: true });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error: err } = await signInWithPassword(email.trim(), password, { rememberMe });
      if (err) {
        setError(err.message ?? "Nie udało się zalogować.");
      }
    } catch (ex) {
      setError(ex?.message ?? "Błąd logowania.");
    } finally {
      setPending(false);
    }
  };

  const onMagicLink = async (e) => {
    e.preventDefault();
    setError(null);
    setMagicInfo(null);
    setPending(true);
    try {
      const { error: err } = await signInWithMagicLink(magicEmail.trim() || email.trim());
      if (err) {
        setError(err.message ?? "Nie udało się wysłać linku.");
      } else {
        setMagicInfo("Sprawdź skrzynkę — wysłaliśmy link logujący.");
      }
    } catch (ex) {
      setError(ex?.message ?? "Błąd.");
    } finally {
      setPending(false);
    }
  };

  const onOAuth = async (provider) => {
    setError(null);
    setPending(true);
    try {
      const { error: err } = await signInWithOAuth(provider);
      if (err) setError(err.message ?? "Błąd OAuth.");
    } catch (ex) {
      setError(ex?.message ?? "Błąd OAuth.");
    } finally {
      setPending(false);
    }
  };

  if (authMode !== "supabase") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(40_7%_93%)] dark:bg-background">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Logowanie</CardTitle>
            <CardDescription>
              Tryb Base44 — zaloguj się przez serwer aplikacji. Aby użyć konta e-mail / Google przez Supabase, ustaw zmienne środowiskowe przy buildzie.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Brak <code className="text-foreground">VITE_SUPABASE_URL</code> i{" "}
              <code className="text-foreground">VITE_SUPABASE_ANON_KEY</code> — logowanie hasłem w tej aplikacji jest niedostępne.
            </p>
            <Button type="button" className="w-full" onClick={() => navigateToLogin()}>
              Otwórz logowanie Base44
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(40_7%_93%)] dark:bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          {step !== "choose" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 mb-2 w-fit gap-1 text-muted-foreground"
              onClick={goChoose}
              disabled={pending}
            >
              <ArrowLeft className="h-4 w-4" />
              Wróć do wyboru
            </Button>
          ) : null}
          <CardTitle className="text-2xl">
            {step === "choose" && "Wybierz sposób logowania"}
            {step === "password" && "E-mail i hasło"}
            {step === "magic" && "Link na e-mail"}
          </CardTitle>
          <CardDescription>
            {step === "choose" && "Fakturowo CRM — zaloguj się kontem społecznościowym, hasłem lub linkiem wysłanym na skrzynkę."}
            {step === "password" && "Podaj adres e-mail i hasło do konta."}
            {step === "magic" && "Wyślemy jednorazowy link logujący — bez hasła."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {magicInfo ? (
            <p className="text-sm text-muted-foreground" role="status">
              {magicInfo}
            </p>
          ) : null}

          {step === "choose" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kontynuuj z</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button type="button" variant="outline" disabled={pending} onClick={() => onOAuth("google")}>
                  Google
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => onOAuth("azure")}>
                  Microsoft
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => onOAuth("github")}>
                  GitHub
                </Button>
              </div>
              <Separator className="my-4" />
              <div className="flex flex-col gap-2">
                <Button type="button" variant="secondary" className="w-full justify-center" disabled={pending} onClick={goPassword}>
                  E-mail i hasło
                </Button>
                <Button type="button" variant="secondary" className="w-full justify-center" disabled={pending} onClick={goMagic}>
                  Link magiczny na e-mail
                </Button>
              </div>
            </div>
          ) : null}

          {step === "password" ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">E-mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="login-password">Hasło</Label>
                  <Link to={createPageUrl("ForgotPassword")} className="text-xs text-primary hover:underline">
                    Zapomniałeś hasła?
                  </Link>
                </div>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(v) => setRememberMe(v === true)}
                  disabled={pending}
                />
                <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                  Zapamiętaj mnie (sesja w przeglądarce)
                </Label>
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Logowanie…" : "Zaloguj się"}
              </Button>
            </form>
          ) : null}

          {step === "magic" ? (
            <form onSubmit={onMagicLink} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="magic-email">E-mail</Label>
                <Input
                  id="magic-email"
                  type="email"
                  autoComplete="email"
                  placeholder="twoj@email.pl"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
              <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
                {pending ? "Wysyłanie…" : "Wyślij link na e-mail"}
              </Button>
            </form>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-col gap-2 border-t pt-6">
          <Button variant="link" className="px-0" asChild>
            <Link to={createPageUrl("Register")}>Utwórz konto</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
