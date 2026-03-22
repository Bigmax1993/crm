import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getNbpTableAForBusinessDay, getMidFromTable } from "@/lib/nbp-rates";

/**
 * Uzupełnia amount_pln dla faktur bez zapisu PLN (szacunek z NBP wg daty wystawienia).
 */
export function useClientEnrichedInvoices(invoices) {
  const dates = useMemo(() => {
    const s = new Set();
    for (const inv of invoices || []) {
      const cur = (inv.currency || "PLN").toUpperCase();
      if (cur === "PLN") continue;
      if (inv.amount_pln != null && Number.isFinite(Number(inv.amount_pln))) continue;
      const d = inv.issue_date?.slice?.(0, 10);
      if (d) s.add(d);
    }
    return [...s].sort();
  }, [invoices]);

  const queries = useQueries({
    queries: dates.map((d) => ({
      queryKey: ["nbp", "table-A", d],
      queryFn: () => getNbpTableAForBusinessDay(d),
      staleTime: Infinity,
    })),
  });

  const querySig = queries.map((q) => `${q.fetchStatus}:${q.dataUpdatedAt}`).join("|");

  return useMemo(() => {
    const tableByDate = {};
    dates.forEach((d, i) => {
      if (queries[i]?.data) tableByDate[d] = queries[i].data;
    });

    return (invoices || []).map((inv) => {
      if (inv.amount_pln != null && Number.isFinite(Number(inv.amount_pln))) return inv;
      const cur = (inv.currency || "PLN").toUpperCase();
      if (cur === "PLN") {
        const amt = Number(inv.amount);
        return { ...inv, amount_pln: Number.isFinite(amt) ? amt : null };
      }
      const d = inv.issue_date?.slice?.(0, 10);
      const table = d ? tableByDate[d] : null;
      const mid = getMidFromTable(table, cur);
      const amt = Number(inv.amount);
      if (!mid || !Number.isFinite(amt)) return inv;
      return {
        ...inv,
        amount_pln: amt * mid,
        _clientEstimatedPln: true,
        _estMid: mid,
        _estTableDate: table?.effectiveDate,
      };
    });
  }, [invoices, dates, querySig]);
}
