import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { createPageUrl } from "@/utils";
import { getSupabase } from "@/lib/supabaseClient";
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

export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword, authMode } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Hasła muszą być takie same.");
      return;
    }
    if (password.length < 6) {
      setError("Hasło: min. 6 znaków.");
      return;
    }
    setPending(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) {
        setError(err.message ?? "Nie udało się zmienić hasła.");
      } else {
        navigate("/", { replace: true });
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
        <p className="text-muted-foreground text-sm">Ta strona wymaga Supabase.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[hsl(40_7%_93%)] dark:bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Nowe hasło</CardTitle>
          <CardDescription>
            {ready
              ? "Ustaw nowe hasło do konta."
              : "Otwórz link z e-maila z resetem hasła. Jeśli już to zrobiłeś, wpisz nowe hasło poniżej."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="rp-pw">Nowe hasło</Label>
              <Input
                id="rp-pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rp-pw2">Powtórz hasło</Label>
              <Input
                id="rp-pw2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={pending}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisywanie…" : "Zapisz hasło"}
            </Button>
            <Button variant="link" className="px-0" asChild>
              <Link to={createPageUrl("Login")}>Logowanie</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
