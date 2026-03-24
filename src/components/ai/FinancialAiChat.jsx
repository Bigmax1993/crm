import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Copy,
  Sparkles,
  History,
  MessageSquarePlus,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { base44 } from "@/api/base44Client";
import { buildCrmContextForAi, stringifyCrmContext } from "@/lib/ai-crm-context";
import { buildFinancialAiSystemPrompt } from "@/lib/ai-financial-chat-prompt";
import {
  openaiChatCompletions,
  isOpenAiConfigured,
  estimateCostUsd,
  cacheGet,
  cacheSet,
  canMakeAiRequest,
} from "@/lib/openai-crm";
import {
  isLikelyGeoQuestion,
  resolveGeoIntentWithGpt,
  geocodeCityWithGpt,
  buildProjectLocationMatches,
  formatGeoProjectsReply,
} from "@/lib/geo-ai";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  createEmptyConversation,
  deriveConversationTitle,
  loadFinancialChatState,
  saveFinancialChatState,
} from "@/lib/ai-financial-chat-persistence";

const SHORTCUT_BUTTONS = [
  { label: "Cash flow", text: "Podsumuj cash flow i ryzyka z danych CRM." },
  { label: "Przeterminowane", text: "Ile faktur jest przeterminowanych i na jaką kwotę?" },
  { label: "Marże projektów", text: "Które projekty mają najniższą marżę, a które najwyższą? Oprzyj się na danych z systemu." },
  { label: "Ryzyko walutowe", text: "Jaka jest ekspozycja EUR z faktur otrzymanych?" },
];

const EXTRA_SUGGESTIONS = [
  "Które projekty przekraczają 80% budżetu?",
  "Który typ obiektu ma najlepszą marżę?",
];

function initialChatState() {
  const d = loadFinancialChatState();
  if (d?.conversations?.length) {
    return {
      conversations: d.conversations,
      activeId: d.activeId || d.conversations[0].id,
    };
  }
  const c = createEmptyConversation();
  saveFinancialChatState([c], c.id);
  return { conversations: [c], activeId: c.id };
}

export function FinancialAiChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [chatState, setChatState] = useState(initialChatState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const msgs = useMemo(
    () => chatState.conversations.find((c) => c.id === chatState.activeId)?.messages ?? [],
    [chatState.conversations, chatState.activeId]
  );

  const sortedConversations = useMemo(
    () => [...chatState.conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [chatState.conversations]
  );

  const setMsgs = useCallback((updater) => {
    setChatState((prev) => {
      const idx = prev.conversations.findIndex((c) => c.id === prev.activeId);
      if (idx === -1) return prev;
      const conv = prev.conversations[idx];
      const newMsgs = typeof updater === "function" ? updater(conv.messages) : updater;
      const nextConvs = [...prev.conversations];
      nextConvs[idx] = {
        ...conv,
        messages: newMsgs,
        updatedAt: Date.now(),
        title: deriveConversationTitle(newMsgs),
      };
      const next = { ...prev, conversations: nextConvs };
      saveFinancialChatState(next.conversations, next.activeId);
      return next;
    });
  }, []);

  const startNewConversation = useCallback(() => {
    setChatState((prev) => {
      const c = createEmptyConversation();
      const next = { conversations: [c, ...prev.conversations], activeId: c.id };
      saveFinancialChatState(next.conversations, next.activeId);
      return next;
    });
    setHistoryOpen(false);
    toast.success("Nowa rozmowa");
  }, []);

  const selectConversation = useCallback((id) => {
    setChatState((prev) => {
      if (!prev.conversations.some((c) => c.id === id)) return prev;
      const next = { ...prev, activeId: id };
      saveFinancialChatState(next.conversations, next.activeId);
      return next;
    });
    setHistoryOpen(false);
  }, []);

  const deleteConversation = useCallback((id) => {
    setChatState((prev) => {
      let nextConvs = prev.conversations.filter((c) => c.id !== id);
      if (nextConvs.length === 0) {
        const c = createEmptyConversation();
        nextConvs = [c];
        const next = { conversations: nextConvs, activeId: c.id };
        saveFinancialChatState(next.conversations, next.activeId);
        return next;
      }
      const nextActive = id === prev.activeId ? nextConvs[0].id : prev.activeId;
      const next = { conversations: nextConvs, activeId: nextActive };
      saveFinancialChatState(next.conversations, next.activeId);
      return next;
    });
    toast.message("Rozmowa usunięta");
  }, []);

  const { data: ctxJson = "{}", refetch: refetchCtx } = useQuery({
    queryKey: ["ai-crm-context"],
    queryFn: () => buildCrmContextForAi(base44),
    enabled: open,
    staleTime: 60_000,
  });

  const ctxStr = useMemo(() => stringifyCrmContext(ctxJson), [ctxJson]);
  const systemPrompt = useMemo(() => buildFinancialAiSystemPrompt(ctxStr), [ctxStr]);

  const estCost = estimateCostUsd(1800);

  const resolveProjectCoords = useCallback(async (projects) => {
    const input = Array.isArray(projects) ? projects : [];
    const out = [...input];
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      if (p?.latitude != null && p?.longitude != null) continue;
      const city = String(p?.city || "").trim();
      if (!city) continue;
      try {
        const geo = await geocodeCityWithGpt(city, "EU");
        if (!geo) continue;
        out[i] = { ...p, latitude: geo.lat, longitude: geo.lon };
        if (p?.id) {
          // Persist resolved coordinates for maps and future filters.
          await base44.entities.ConstructionSite.update(p.id, {
            latitude: geo.lat,
            longitude: geo.lon,
          });
        }
      } catch {
        /* non-blocking: fallback to existing data only */
      }
    }
    return out;
  }, []);

  const handleGeoQuery = useCallback(
    async (question) => {
      const intent = await resolveGeoIntentWithGpt(question);
      if (!intent?.is_geo_query) return null;

      const center = await geocodeCityWithGpt(intent.city, intent.country_iso2 || "PL");
      if (!center) {
        return `Nie udało się ustalić współrzędnych dla miejscowości „${intent.city}”. Podaj proszę kraj lub kod pocztowy.`;
      }

      const projects = await base44.entities.ConstructionSite.list("-created_date");
      const withCoords = await resolveProjectCoords(projects);
      const rows = buildProjectLocationMatches(
        withCoords,
        { lat: center.lat, lon: center.lon },
        intent.radius_km
      );
      return formatGeoProjectsReply({
        city: intent.city,
        countryIso2: center.country_iso2 || intent.country_iso2 || "PL",
        radiusKm: intent.radius_km,
        rows,
      });
    },
    [resolveProjectCoords]
  );

  const send = useCallback(
    async (text) => {
      const t = (text || "").trim();
      if (!t) return;
      if (!isOpenAiConfigured()) {
        toast.error("Brak klucza OpenAI — ustaw VITE_OPENAI_API_KEY lub Ustawienia AI");
        return;
      }
      const gate = canMakeAiRequest();
      if (!gate.ok) {
        toast.error("Limit dzienny AI lub brak konfiguracji");
        return;
      }

      const userMsg = { role: "user", content: t };
      setMsgs((m) => [...m, { role: "user", content: t }, { role: "assistant", content: null, loading: true }]);
      setInput("");
      setLoading(true);

      if (isLikelyGeoQuestion(t)) {
        try {
          const geoReply = await handleGeoQuery(t);
          if (geoReply) {
            setMsgs((m) => {
              const copy = [...m];
              copy.pop();
              copy.push({ role: "assistant", content: geoReply });
              return copy;
            });
            return;
          }
        } catch (e) {
          toast.error(`Geolokalizacja AI: ${e?.message || "błąd"}`);
        }
      }

      const cachePayload = { q: t, ctx: ctxStr.slice(0, 2000) };
      const cached = cacheGet("chat", cachePayload);
      if (cached) {
        setMsgs((m) => {
          const copy = [...m];
          copy.pop();
          copy.push({ role: "assistant", content: cached + "\n\n_(z cache 24h)_" });
          return copy;
        });
        setLoading(false);
        toast.message("Odpowiedź z cache (24h)");
        return;
      }

      try {
        const history = msgs
          .filter((m) => (m.role === "user" || m.role === "assistant") && m.content != null && !m.loading)
          .map((x) => ({ role: x.role, content: x.content }));
        const messages = [
          { role: "system", content: systemPrompt },
          ...history,
          userMsg,
        ];

        const { text: reply } = await openaiChatCompletions({
          messages,
          max_tokens: 2000,
          temperature: 0.25,
        });

        cacheSet("chat", cachePayload, reply);

        setMsgs((m) => {
          const copy = [...m];
          copy.pop();
          copy.push({ role: "assistant", content: reply });
          return copy;
        });
      } catch (e) {
        setMsgs((m) => {
          const copy = [...m];
          copy.pop();
          copy.push({
            role: "assistant",
            content:
              "AI tymczasowo niedostępna lub błąd API. Sprawdź klucz, limity i konsolę.\n\n" + (e?.message || ""),
          });
          return copy;
        });
        toast.error(e?.message || "Błąd OpenAI");
      } finally {
        setLoading(false);
      }
    },
    [msgs, systemPrompt, ctxStr, handleGeoQuery]
  );

  const copyLast = () => {
    const last = [...msgs].reverse().find((m) => m.role === "assistant" && m.content);
    if (!last?.content) return;
    navigator.clipboard.writeText(last.content);
    toast.success("Skopiowano odpowiedź");
  };

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="fixed bottom-6 right-6 z-[60] h-14 w-14 rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 p-0"
        onClick={() => {
          setOpen(true);
          refetchCtx();
        }}
        aria-label="Zapytaj AI"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="fixed inset-y-0 right-0 z-[70] w-full max-w-[400px] border-l border-border bg-card shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="truncate">Asystent finansowy AI</span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={startNewConversation}
                  disabled={loading}
                  title="Nowa rozmowa"
                  aria-label="Nowa rozmowa"
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setHistoryOpen((v) => !v)}
                  title="Historia rozmów"
                  aria-label="Historia rozmów"
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => deleteConversation(chatState.activeId)}
                  disabled={loading}
                  title="Usuń bieżącą rozmowę"
                  aria-label="Usuń bieżącą rozmowę"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Zamknij">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground px-3 py-1 border-b border-border">
              Szac. koszt ~${estCost.toFixed(3)} / zapytanie · limity w Ustawieniach AI
            </p>
            {historyOpen && (
              <div className="border-b border-border max-h-[40vh] overflow-y-auto">
                <p className="text-[10px] text-muted-foreground px-3 py-1.5">Wcześniejsze rozmowy (zapisane w tej przeglądarce)</p>
                <ul className="px-1 pb-2 space-y-0.5">
                  {sortedConversations.map((c) => (
                    <li key={c.id}>
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2 py-1.5 text-xs",
                          c.id === chatState.activeId ? "bg-muted" : "hover:bg-muted/60"
                        )}
                      >
                        <button
                          type="button"
                          className="flex-1 min-w-0 text-left truncate font-medium"
                          onClick={() => selectConversation(c.id)}
                          disabled={loading}
                        >
                          {c.title}
                        </button>
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {c.updatedAt
                            ? new Date(c.updatedAt).toLocaleString("pl-PL", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => deleteConversation(c.id)}
                          disabled={loading}
                          aria-label={`Usuń rozmowę ${c.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ScrollArea className="flex-1 px-3 py-2">
              <div className="space-y-3 pr-2">
                {msgs.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Zadaj pytanie o finanse. Asystent korzysta z danych z Twojego CRM i lokalnych zestawień — bez żargonu
                    technicznego w odpowiedziach.
                  </p>
                )}
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={cn("flex gap-2", m.role === "user" ? "flex-row-reverse ml-2" : "mr-2")}
                  >
                    <div
                      className={cn(
                        "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border",
                        m.role === "user"
                          ? "bg-blue-700 text-white border-blue-500"
                          : "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100"
                      )}
                      aria-hidden
                    >
                      {m.role === "user" ? "Ty" : "AI"}
                    </div>
                    <div
                      className={cn(
                        "min-w-0 flex-1 rounded-lg px-3 py-2 text-sm",
                        m.role === "user" ? "bg-blue-600 text-white" : "bg-muted",
                        m.loading && "animate-pulse"
                      )}
                    >
                      <div className="text-[10px] opacity-70 mb-0.5">
                        {m.role === "user" ? "Ty" : "AI"}
                      </div>
                      <div className="whitespace-pre-wrap">{m.loading ? "…" : m.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="border-t border-border p-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                {SHORTCUT_BUTTONS.map((s) => (
                  <Button
                    key={s.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-7 px-2"
                    disabled={loading}
                    onClick={() => send(s.text)}
                  >
                    {s.label}
                  </Button>
                ))}
                {EXTRA_SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-7 px-2 text-muted-foreground"
                    disabled={loading}
                    onClick={() => send(s)}
                  >
                    {s.length > 32 ? s.slice(0, 30) + "…" : s}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  placeholder="Pytanie…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  className="resize-none text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={loading} onClick={() => send(input)}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  Wyślij
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={copyLast} title="Kopiuj ostatnią odpowiedź">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
