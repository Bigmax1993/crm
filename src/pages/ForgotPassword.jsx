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

export default function ForgotPassword() {
  const { resetPasswordForEmail, authMode } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      const { error: err } = await resetPasswordForEmail(email.trim());
      if (err) {
        setError(err.message ?? "Nie udało się wysłać wiadomości.");
      } else {
        setInfo("Jeśli konto istnieje, wyślemy link resetu hasła na podany adres.");
      }
    } catch (ex) {
      setError(ex?.message ?? "Błąd.");
    } finally {
      setPending(false);
    }
  };

  if (authMode !== "supabase") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <p className="text-muted-foreground text-sm">Reset hasła wymaga konfiguracji Supabase.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(40_7%_93%)] dark:bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Reset hasła</CardTitle>
          <CardDescription>Podaj e-mail — wyślemy link do ustawienia nowego hasła.</CardDescription>
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
              <Label htmlFor="fp-email">E-mail</Label>
              <Input
                id="fp-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={pending}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button type="submit" disabled={pending}>
              {pending ? "Wysyłanie…" : "Wyślij link"}
            </Button>
            <Button variant="link" className="px-0" asChild>
              <Link to={createPageUrl("Login")}>Powrót do logowania</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
