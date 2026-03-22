import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNbpLatestTableA } from "@/lib/nbp-rates";
import { loadFxConfig } from "@/lib/fx-config-store";

const CurrencyDisplayContext = createContext(null);

function fmtDate(d) {
  return d || "—";
}

export function CurrencyDisplayProvider({ children }) {
  const [displayCurrency, setDisplayCurrency] = useState("PLN");
  const { data: latest } = useQuery({
    queryKey: ["nbp", "latest-table"],
    queryFn: getNbpLatestTableA,
    staleTime: 1000 * 60 * 60 * 6,
    refetchInterval: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: true,
  });

  const mids = latest?.rates || { PLN: 1 };
  const fxConfig = loadFxConfig();
  const baseCurrency = fxConfig.baseCurrency || "PLN";

  /** Wejście zawsze w PLN — konwersja tylko gdy wyświetlamy inną walutę (kurs z NBP). */
  const convertPlnToDisplay = useCallback(
    (pln) => {
      const n = Number(pln);
      if (!Number.isFinite(n)) return 0;
      if (displayCurrency === "PLN") return n;
      const mid = mids[displayCurrency];
      if (!mid) return n;
      return n / mid;
    },
    [displayCurrency, mids]
  );

  const value = useMemo(
    () => ({
      displayCurrency,
      setDisplayCurrency,
      latestTable: latest,
      mids,
      baseCurrency,
      convertPlnToDisplay,
      formatDisplayAmount(pln, options = {}) {
        const v = convertPlnToDisplay(pln);
        const cur = displayCurrency === baseCurrency ? baseCurrency : displayCurrency;
        return `${v.toLocaleString("pl-PL", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          ...options,
        })} ${cur}`;
      },
      buildMoneyTooltip({ plnAtIssue, originalAmount, originalCurrency, nbpMidIssue, nbpDateIssue, nbpMidPaid, nbpDatePaid, fxDiff }) {
        const orig = (originalCurrency || "PLN").toUpperCase();
        const lines = [
          `Oryginał: ${originalAmount != null ? originalAmount : "—"} ${orig}`,
          plnAtIssue != null ? `Kwota PLN (wystawienie): ${Number(plnAtIssue).toLocaleString("pl-PL", { minimumFractionDigits: 2 })}` : null,
          nbpMidIssue != null ? `Kurs NBP wystawienie: ${nbpMidIssue} (${fmtDate(nbpDateIssue)})` : null,
          nbpMidPaid != null ? `Kurs NBP płatność: ${nbpMidPaid} (${fmtDate(nbpDatePaid)})` : null,
          fxDiff != null && Number.isFinite(Number(fxDiff))
            ? `Różnica kursowa: ${Number(fxDiff).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN`
            : null,
          `Wyświetlanie: ${displayCurrency} (1 ${displayCurrency} = ${mids[displayCurrency] ? `${mids[displayCurrency]} PLN` : "—"})`,
        ];
        return lines.filter(Boolean).join("\n");
      },
    }),
    [displayCurrency, latest, mids, baseCurrency, convertPlnToDisplay]
  );

  return <CurrencyDisplayContext.Provider value={value}>{children}</CurrencyDisplayContext.Provider>;
}

export function useCurrencyDisplay() {
  const ctx = useContext(CurrencyDisplayContext);
  if (!ctx) {
    return {
      displayCurrency: "PLN",
      setDisplayCurrency: () => {},
      latestTable: null,
      mids: { PLN: 1 },
      baseCurrency: "PLN",
      convertPlnToDisplay: (x) => x,
      formatDisplayAmount: (pln) =>
        `${Number(pln).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN`,
      buildMoneyTooltip: () => "",
    };
  }
  return ctx;
}
