import React from "react";
import { cn } from "@/lib/utils";
import { useCurrencyDisplay } from "@/contexts/CurrencyDisplayContext";

export function MoneyValue({
  plnAmount,
  originalAmount,
  originalCurrency,
  nbpMidIssue,
  nbpDateIssue,
  nbpMidPaid,
  nbpDatePaid,
  fxDiff,
  className,
}) {
  const { formatDisplayAmount, buildMoneyTooltip } = useCurrencyDisplay();
  const orig = (originalCurrency || "PLN").toUpperCase();
  const tooltip = buildMoneyTooltip({
    plnAtIssue: plnAmount,
    originalAmount,
    originalCurrency: orig,
    nbpMidIssue,
    nbpDateIssue,
    nbpMidPaid,
    nbpDatePaid,
    fxDiff,
  });

  if (plnAmount == null || !Number.isFinite(Number(plnAmount))) {
    return (
      <span className={cn("text-muted-foreground", className)} title={tooltip}>
        —
      </span>
    );
  }

  return (
    <span className={cn("cursor-help border-b border-dotted border-muted-foreground/50", className)} title={tooltip}>
      {formatDisplayAmount(plnAmount)}
      {orig !== "PLN" && (
        <span className="text-xs text-muted-foreground ml-1 whitespace-nowrap">
          ({originalAmount != null ? originalAmount : "—"} {orig})
        </span>
      )}
    </span>
  );
}
