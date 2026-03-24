import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getAiSettings,
  saveAiSettings,
  getUsageToday,
  getAiHistory,
  getOpenAiApiKey,
} from "@/lib/openai-crm";

export default function SettingsAI() {
  const envHint = (import.meta.env?.VITE_OPENAI_API_KEY || "").trim() ? "Ustawiony w .env (VITE_…)" : "Brak w .env";

  const [form, setForm] = useState(getAiSettings);
  const [usage, setUsage] = useState(getUsageToday);
  const [history, setHistory] = useState(getAiHistory);

  useEffect(() => {
    const up = () => {
      setForm(getAiSettings());
      setUsage(getUsageToday());
      setHistory(getAiHistory());
    };
    window.addEventListener("fakturowo-ai-settings", up);
    return () => window.removeEventListener("fakturowo-ai-settings", up);
  }, []);

  const masked = () => {
    const k = getOpenAiApiKey();
    if (!k) return "—";
    if (k.length < 8) return "••••";
    return `${k.slice(0, 4)}…${k.slice(-4)}`;
  };

  const save = () => {
    saveAiSettings(form);
    toast.success("Zapisano ustawienia AI");
    setUsage(getUsageToday());
  };

  const clearHistory = () => {
    localStorage.removeItem("fakturowo_ai_history_v1");
    setHistory([]);
    toast.success("Wyczyszczono historię");
  };

  return (
    <div className="w-full p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-amber-500" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Ustawienia AI</h1>
            <p className="text-muted-foreground text-sm">OpenAI GPT — klucz, model, limity, historia</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Klucz API</CardTitle>
            <CardDescription>
              Domyślnie: <code className="text-xs">VITE_OPENAI_API_KEY</code> ({envHint}). Pole poniżej nadpisuje klucz
              lokalnie (przeglądarka) — wyświetlanie maskowane.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Aktywny klucz (podgląd)</Label>
              <p className="text-sm font-mono mt-1">{masked()}</p>
            </div>
            <div>
              <Label htmlFor="apikey">Nadpisanie klucza (opcjonalnie)</Label>
              <Input
                id="apikey"
                type="password"
                autoComplete="off"
                placeholder="sk-…"
                value={form.apiKeyOverride}
                onChange={(e) => setForm({ ...form, apiKeyOverride: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Przechowywane w localStorage (nie szyfrowane) — używaj profilu prywatnego lub .env produkcyjnie.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model i język</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Model</Label>
              <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Język odpowiedzi (prompt)</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pl">Polski</SelectItem>
                  <SelectItem value="en">Angielski</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limity i alerty</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Częstotliwość analizy alertów (dashboard)</Label>
              <Select
                value={String(form.alertIntervalHours)}
                onValueChange={(v) => setForm({ ...form, alertIntervalHours: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">co 6 h</SelectItem>
                  <SelectItem value="12">co 12 h</SelectItem>
                  <SelectItem value="24">co 24 h</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Limit zapytań / dzień</Label>
              <Input
                type="number"
                min={1}
                value={form.dailyQueryLimit}
                onChange={(e) => setForm({ ...form, dailyQueryLimit: Number(e.target.value) || 50 })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Limit tokenów / dzień (szacunkowy)</Label>
              <Input
                type="number"
                min={1000}
                step={1000}
                value={form.dailyTokenLimit}
                onChange={(e) => setForm({ ...form, dailyTokenLimit: Number(e.target.value) || 200000 })}
              />
            </div>
            <div className="sm:col-span-2 text-sm text-muted-foreground">
              Dziś: <strong>{usage.requests}</strong> zapytań, <strong>{usage.tokens}</strong> tokenów (wg odpowiedzi API).
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Historia zapytań</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={clearHistory}>
              <Trash2 className="h-4 w-4 mr-1" />
              Wyczyść
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Czas</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Tokeny</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-sm">
                      Brak wpisów
                    </TableCell>
                  </TableRow>
                ) : (
                  history.slice(0, 30).map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">
                        {new Date(h.ts).toLocaleString("pl-PL")}
                      </TableCell>
                      <TableCell className="text-xs">{h.type || "—"}</TableCell>
                      <TableCell className="text-right text-xs">{h.tokens}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Button onClick={save} className="bg-blue-600 hover:bg-blue-700">
          <Save className="h-4 w-4 mr-2" />
          Zapisz ustawienia
        </Button>
      </div>
    </div>
  );
}
