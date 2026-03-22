import React, { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";
import { loadFxConfig } from "@/lib/fx-config-store";

const DEFAULT_VIEW = ["PLN", "EUR", "USD"];

export function CurrencySwitcher() {
  const { displayCurrency, setDisplayCurrency } = useCurrencyDisplay();
  const [fxRev, setFxRev] = useState(0);
  useEffect(() => {
    const up = () => setFxRev((x) => x + 1);
    window.addEventListener("mizar-fx-config", up);
    return () => window.removeEventListener("mizar-fx-config", up);
  }, []);
  const options = useMemo(() => {
    void fxRev;
    const active = new Set(loadFxConfig().activeCurrencies || DEFAULT_VIEW);
    return DEFAULT_VIEW.filter((c) => active.has(c));
  }, [fxRev]);

  return (
    <div className="flex items-center gap-2 text-sm shrink-0">
      <span className="text-muted-foreground hidden md:inline">Waluta widoku</span>
      <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
        <SelectTrigger className="h-9 w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
