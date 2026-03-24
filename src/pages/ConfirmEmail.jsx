import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
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

export default function ConfirmEmail() {
  const { user, resendSignupEmail, logout, authMode } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [pending, setPending] = useState(false);

  const onResend = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      const { error: err } = await resendSignupEmail(email.trim());
      if (err) {
        setError(err.message ?? "Nie udało się wysłać ponownie.");
      } else {
        setInfo("Wysłano wiadomość — sprawdź skrzynkę (także folder spam).");
      }
    } catch (ex) {
      setError(ex?.message ?? "Błąd.");
    } finally {
      setPending(false);
    }
  };

  if (authMode !== "supabase") {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(40_7%_93%)] dark:bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Potwierdź adres e-mail</CardTitle>
          <CardDescription>
            Dostęp do aplikacji jest możliwy po kliknięciu w link z wiadomości rejestracyjnej. Możesz też wysłać wiadomość
            ponownie.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onResend}>
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
              <Label htmlFor="ce-email">E-mail</Label>
              <Input
                id="ce-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={pending}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Wysyłanie…" : "Wyślij ponownie link potwierdzający"}
            </Button>
            <Button type="button" variant="outline" onClick={() => logout()}>
              Wyloguj się
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
