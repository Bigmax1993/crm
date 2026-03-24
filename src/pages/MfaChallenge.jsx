import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listTotpFactors, verifyMfaCode } from "@/lib/authMfa";
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

export default function MfaChallenge() {
  const navigate = useNavigate();
  const { refreshMfaPending, authMode, logout } = useAuth();
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { factors, error: err } = await listTotpFactors();
      if (cancelled) return;
      if (err) {
        setError(err.message ?? "Nie udało się wczytać listy faktorów.");
        return;
      }
      const first = factors[0];
      if (first?.id) setFactorId(first.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!factorId) {
      setError("Brak skonfigurowanego TOTP.");
      return;
    }
    setPending(true);
    try {
      const { error: err } = await verifyMfaCode(factorId, code.replace(/\s/g, ""));
      if (err) {
        setError(err.message ?? "Nieprawidłowy kod.");
      } else {
        await refreshMfaPending();
        navigate("/", { replace: true });
      }
    } catch (ex) {
      setError(ex?.message ?? "Błąd weryfikacji.");
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
          <CardTitle className="text-2xl">Weryfikacja dwuskładnikowa</CardTitle>
          <CardDescription>Wpisz 6-cyfrowy kod z aplikacji Authenticator.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Kod TOTP</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                disabled={pending}
                placeholder="123456"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Sprawdzanie…" : "Potwierdź"}
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
