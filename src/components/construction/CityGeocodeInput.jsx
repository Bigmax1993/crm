import React, { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchPhotonPoland } from "@/lib/photon-geocode";
import { geocodeCityWithGpt } from "@/lib/geo-ai";
import { isOpenAiConfigured } from "@/lib/openai-crm";
import { toast } from "sonner";

/**
 * Miasto z listą sugestii (Photon) + opcjonalnie uzupełnienie GPS przez OpenAI (geo-ai).
 */
export function CityGeocodeInput({ city, latitude, longitude, onPatch, disabled, id }) {
  const [open, setOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [results, setResults] = useState([]);
  const [highlight, setHighlight] = useState(-1);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const listId = `${id || "city-geo"}-listbox`;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = String(city || "").trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingList(true);
      try {
        const rows = await searchPhotonPoland(q);
        setResults(rows);
        setOpen(rows.length > 0);
        setHighlight(-1);
      } catch (e) {
        setResults([]);
        setOpen(false);
        const msg = e?.message || "";
        toast.error(
          msg.includes("Photon HTTP")
            ? "Geokodowanie (Photon): serwer odrzucił zapytanie. Spróbuj ponownie za chwilę lub użyj przycisku OpenAI."
            : msg || "Nie udało się pobrać sugestii miejscowości."
        );
      } finally {
        setLoadingList(false);
      }
    }, 380);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [city]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const applyRow = (row) => {
    onPatch({
      city: row.cityValue,
      latitude: Number(row.lat).toFixed(6),
      longitude: Number(row.lon).toFixed(6),
    });
    setOpen(false);
    setResults([]);
  };

  const fillWithAi = async () => {
    const q = String(city || "").trim();
    if (q.length < 2) {
      toast.message("Najpierw wpisz nazwę miejscowości.");
      return;
    }
    if (!isOpenAiConfigured()) {
      toast.message("OpenAI: ustaw klucz w Ustawieniach AI lub VITE_OPENAI_API_KEY, aby użyć uzupełniania GPS przez model.");
      return;
    }
    setLoadingAi(true);
    try {
      const r = await geocodeCityWithGpt(q, "PL");
      if (!r || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) {
        toast.error("AI nie zwróciło poprawnych współrzędnych.");
        return;
      }
      const namePl = r.official_name_pl || r.city || q;
      onPatch({
        city: namePl,
        latitude: Number(r.lat).toFixed(6),
        longitude: Number(r.lon).toFixed(6),
      });
      toast.success("Uzupełniono miasto i współrzędne (OpenAI).");
      setOpen(false);
    } catch (e) {
      toast.error(e?.message || "Błąd geokodowania AI.");
    } finally {
      setLoadingAi(false);
    }
  };

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      applyRow(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div ref={wrapRef} className="relative">
        <Label htmlFor={id || "construction-city"}>Miasto *</Label>
        <div className="relative mt-1.5">
          <Input
            id={id || "construction-city"}
            value={city}
            disabled={disabled}
            autoComplete="off"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            role="combobox"
            onChange={(e) => onPatch({ city: e.target.value })}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            required
            className={cn(loadingList && "pr-9")}
          />
          {loadingList ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {open && results.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          >
            {results.map((row, i) => (
              <li key={row.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                    i === highlight && "bg-accent"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyRow(row)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{row.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {Number(row.lat).toFixed(4)}, {Number(row.lon).toFixed(4)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Zacznij pisać (np. „Wroclaw”) — wybierz sugestię z listy, aby ustawić poprawną nazwę i GPS. Obiekt z wypełnionymi współrzędnymi pojawi się na{" "}
        <strong>Mapie obiektów</strong>.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || loadingAi || String(city || "").trim().length < 2}
          onClick={fillWithAi}
        >
          {loadingAi ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          Uzupełnij nazwę i GPS (OpenAI)
        </Button>
        {latitude && longitude ? (
          <span className="text-xs text-muted-foreground">
            GPS: {latitude}, {longitude}
          </span>
        ) : null}
      </div>
    </div>
  );
}
