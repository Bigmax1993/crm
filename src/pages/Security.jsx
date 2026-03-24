import React, { useState, useEffect, useCallback } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Security() {
  const { authMode } = useAuth();
  const [factors, setFactors] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [enrollQr, setEnrollQr] = useState(null);
  const [enrollFactorId, setEnrollFactorId] = useState(null);
  const [enrollSecret, setEnrollSecret] = useState(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState(null);

  const refreshFactors = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) {
      setLoadError(error.message);
      return;
    }
    const totp = data?.totp ?? [];
    setFactors(totp);
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (authMode !== "supabase") return;
    refreshFactors();
  }, [authMode, refreshFactors]);

  const startEnrollTotp = async () => {
    setMsg(null);
    setPending(true);
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data, error } = await sb.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Fakturowo Authenticator",
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      setEnrollFactorId(data.id);
      setEnrollQr(data.totp?.qr_code ?? null);
      setEnrollSecret(data.totp?.secret ?? null);
    } finally {
      setPending(false);
    }
  };

  const completeEnroll = async (e) => {
    e.preventDefault();
    if (!enrollFactorId) return;
    setPending(true);
    setMsg(null);
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId: enrollFactorId });
      if (chErr) {
        setMsg(chErr.message);
        return;
      }
      const { error: vErr } = await sb.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challenge.id,
        code: verifyCode.replace(/\s/g, ""),
      });
      if (vErr) {
        setMsg(vErr.message);
        return;
      }
      setEnrollQr(null);
      setEnrollFactorId(null);
      setEnrollSecret(null);
      setVerifyCode("");
      setMsg("Authenticator został powiązany z kontem.");
      await refreshFactors();
    } finally {
      setPending(false);
    }
  };

  const removeFactor = async (factorId) => {
    setPending(true);
    setMsg(null);
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId });
      if (error) setMsg(error.message);
      else {
        setMsg("Usunięto składnik MFA.");
        await refreshFactors();
      }
    } finally {
      setPending(false);
    }
  };

  if (authMode !== "supabase") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Bezpieczeństwo</h1>
        <p className="text-muted-foreground text-sm">
          MFA i rozszerzone logowanie są dostępne po skonfigurowaniu Supabase (<code className="text-foreground">VITE_SUPABASE_*</code>
          ).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bezpieczeństwo konta</h1>
        <p className="text-muted-foreground text-sm mt-1">MFA (TOTP), sesja i integracje enterprise.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uwierzytelnianie dwuskładnikowe (TOTP)</CardTitle>
          <CardDescription>
            Dodaj aplikację Authenticator (Google Authenticator, Microsoft Authenticator). Po włączeniu przy logowaniu
            zostaniesz poproszony o kod 6-cyfrowy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}
          {msg ? (
            <p className="text-sm text-muted-foreground" role="status">
              {msg}
            </p>
          ) : null}

          <ul className="space-y-2">
            {factors.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                <span className="text-sm">
                  {f.friendly_name ?? "TOTP"} <span className="text-muted-foreground">({f.status})</span>
                </span>
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => removeFactor(f.id)}>
                  Usuń
                </Button>
              </li>
            ))}
          </ul>

          {!enrollQr ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={startEnrollTotp}>
              Dodaj Authenticator (TOTP)
            </Button>
          ) : (
            <form onSubmit={completeEnroll} className="space-y-4">
              {enrollQr ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Zeskanuj kod QR w aplikacji Authenticator</p>
                  <img
                    src={enrollQr}
                    className="h-40 w-40 rounded border border-border bg-white p-1"
                    alt="Kod QR do skonfigurowania Authenticator"
                  />
                  {enrollSecret ? (
                    <p className="text-xs text-muted-foreground break-all">
                      Klucz ręczny: <code>{enrollSecret}</code>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="sec-verify">Kod z aplikacji</Label>
                <Input
                  id="sec-verify"
                  inputMode="numeric"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="123456"
                  required
                  disabled={pending}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  Potwierdź i zapisz
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEnrollQr(null);
                    setEnrollFactorId(null);
                    setEnrollSecret(null);
                    setVerifyCode("");
                  }}
                >
                  Anuluj
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesja i „zapamiętaj mnie”</CardTitle>
          <CardDescription>
            Przy logowaniu hasłem możesz zaznaczyć „Zapamiętaj mnie” — sesja jest wtedy w <strong>localStorage</strong>
            (dłużej). Bez zaznaczenia używany jest <strong>sessionStorage</strong> (do zamknięcia karty).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Czas życia tokenów ustawiasz w Supabase: Authentication → Settings → JWT expiry.
          </p>
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Logowanie SSO (SAML / OIDC)</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            Dla organizacji: w panelu Supabase skonfiguruj dostawcę SAML lub OIDC (Authentication → Providers), następnie
            dodaj domeny i certyfikaty zgodnie z dokumentacją dostawcy tożsamości.
          </p>
          <a
            className="text-primary underline font-medium"
            href="https://supabase.com/docs/guides/auth/enterprise-sso"
            target="_blank"
            rel="noreferrer"
          >
            Dokumentacja Supabase — Enterprise SSO
          </a>
        </AlertDescription>
      </Alert>

      <Alert>
        <AlertTitle>Passkeys (WebAuthn)</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            Passkeys można włączać w projektach z odpowiednim planem i konfiguracją Authentication w Supabase (funkcje
            WebAuthn). Frontend ten można rozszerzyć o <code className="text-foreground">signInWithWebAuthn</code>, gdy
            provider będzie aktywny w Twoim projekcie.
          </p>
          <a
            className="text-primary underline font-medium"
            href="https://supabase.com/docs/guides/auth/auth-webauthn"
            target="_blank"
            rel="noreferrer"
          >
            Dokumentacja — WebAuthn
          </a>
        </AlertDescription>
      </Alert>
    </div>
  );
}
