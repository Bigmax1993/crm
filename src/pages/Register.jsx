import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Register() {
  const { signUp, authMode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password !== confirm) {
      setError("Hasła muszą być takie same.");
      return;
    }
    if (password.length < 6) {
      setError("Hasło powinno mieć co najmniej 6 znaków.");
      return;
    }
    setPending(true);
    try {
      const { error: err } = await signUp(email.trim(), password);
      if (err) {
        setError(err.message ?? "Nie udało się zarejestrować.");
        return;
      }
      setInfo("Jeśli włączone jest potwierdzanie e-maila, sprawdź skrzynkę. Potem możesz przejść do logowania.");
    } catch (ex) {
      setError(ex?.message ?? "Błąd rejestracji.");
    } finally {
      setPending(false);
    }
  };

  if (authMode !== "supabase") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <p className="text-muted-foreground text-sm">
          Rejestracja Supabase jest wyłączona. Ustaw zmienne <code className="text-foreground">VITE_SUPABASE_*</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(40_7%_93%)] dark:bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Rejestracja</CardTitle>
          <CardDescription>Nowe konto — domyślna rola: użytkownik. Administratora ustawiasz w Supabase (metadata).</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="text-sm text-muted-foreground" role="status">
                {info}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="reg-email">E-mail</Label>
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">Hasło</Label>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm">Powtórz hasło</Label>
              <Input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={pending}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <Button type="submit" disabled={pending}>
              {pending ? "Tworzenie…" : "Zarejestruj się"}
            </Button>
            <Button variant="link" className="px-0" asChild>
              <Link to={createPageUrl("Login")}>Mam już konto</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
