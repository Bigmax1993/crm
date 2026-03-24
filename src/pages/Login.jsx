import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Login() {
  const {
    signInWithPassword,
    signInWithOAuth,
    signInWithMagicLink,
    authMode,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [magicEmail, setMagicEmail] = useState("");
  const [error, setError] = useState(null);
  const [magicInfo, setMagicInfo] = useState(null);
  const [pending, setPending] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <p className="text-muted-foreground text-sm">
          Logowanie Supabase jest wyłączone. Ustaw <code className="text-foreground">VITE_SUPABASE_URL</code> oraz{" "}
          <code className="text-foreground">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(40_7%_93%)] dark:bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Logowanie</CardTitle>
          <CardDescription>Fakturowo CRM — hasło, link e-mail lub dostawca tożsamości.</CardDescription>
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

          <div className="flex flex-col gap-2">
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
          </div>

          <Separator />

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

          <Separator />

          <form onSubmit={onMagicLink} className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Link magiczny (bez hasła)</p>
            <div className="space-y-2">
              <Label htmlFor="magic-email">E-mail (możesz użyć pola powyżej — wpisz tutaj lub wyżej)</Label>
              <Input
                id="magic-email"
                type="email"
                autoComplete="email"
                placeholder={email || "twoj@email.pl"}
                value={magicEmail}
                onChange={(e) => setMagicEmail(e.target.value)}
                disabled={pending}
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
              Wyślij link na e-mail
            </Button>
          </form>
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
