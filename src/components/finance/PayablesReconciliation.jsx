import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link2, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatInvoiceSourceAmount } from "@/lib/finance-pln";
import { displayInvoiceSeller } from "@/lib/invoice-schema";
import { suggestPayableReconciliation, listUnmatchedOutgoingTransfers } from "@/lib/transfer-reconciliation";
import { logAuditEvent, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getProjectDisplayName } from "@/lib/match-project";

function formatTransferAmount(t) {
  const n = Number(t.amount);
  if (!Number.isFinite(n)) return "—";
  const cur = String(t.currency || "PLN").toUpperCase();
  return `${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

export function PayablesReconciliation({ payablesOpen, transfers, projectById }) {
  const queryClient = useQueryClient();
  const [linkingId, setLinkingId] = useState(null);

  const unmatched = useMemo(() => listUnmatchedOutgoingTransfers(transfers), [transfers]);
  const suggestions = useMemo(
    () => suggestPayableReconciliation(payablesOpen, transfers),
    [payablesOpen, transfers]
  );

  const reconcileMutation = useMutation({
    mutationFn: async ({ transfer, invoice }) => {
      await base44.entities.Transfer.update(transfer.id, {
        invoice_id: invoice.id,
        match_status: "dopasowano",
        matched_at: new Date().toISOString(),
      });
      await base44.entities.Invoice.update(invoice.id, { status: "paid" });
      await logAuditEvent({
        action: AUDIT_ACTIONS.INVOICE_RECONCILE,
        entity_type: "Invoice",
        entity_id: invoice.id,
        summary: `Rozliczono FV ${invoice.invoice_number || ""} z przelewem`,
        detail: {
          transfer_id: transfer.id,
          kwota_przelewu: transfer.amount,
          waluta: transfer.currency,
        },
        actor: "użytkownik",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      toast.success("Przelew przypisany do faktury — FV oznaczona jako opłacona.");
    },
    onError: (e) => toast.error(e?.message || "Nie udało się rozliczyć przelewu."),
    onSettled: () => setLinkingId(null),
  });

  if (!unmatched.length && !suggestions.length) {
    return (
      <p className="text-sm text-muted-foreground px-6 pb-6">
        Brak nierozliczonych przelewów do dopasowania. Po imporcie przelewów sugestie pojawią się tutaj.
      </p>
    );
  }

  return (
    <div className="border-t border-border px-6 py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">Rozliczenia bankowe</h3>
          <p className="text-xs text-muted-foreground">
            Nierozliczone przelewy: {unmatched.length}
            {suggestions.length ? ` · ${suggestions.length} sugestii dopasowania` : ""}
          </p>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Przelew</TableHead>
                <TableHead>Faktura</TableHead>
                <TableHead>Pewność</TableHead>
                <TableHead className="text-right">Akcja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map(({ transfer, invoice, score, reason }) => {
                const project = invoice.project_id ? projectById.get(invoice.project_id) : null;
                const busy = linkingId === transfer.id;
                return (
                  <TableRow key={`${transfer.id}-${invoice.id}`}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{formatTransferAmount(transfer)}</div>
                      <div className="text-muted-foreground truncate max-w-[200px]">
                        {transfer.contractor_name || transfer.title || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {transfer.transfer_date ? String(transfer.transfer_date).slice(0, 10) : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{invoice.invoice_number || "—"}</div>
                      <div className="text-muted-foreground truncate max-w-[200px]">
                        {displayInvoiceSeller(invoice) || "—"}
                      </div>
                      <div>{formatInvoiceSourceAmount(invoice)}</div>
                      {project ? (
                        <div className="text-xs text-muted-foreground">{getProjectDisplayName(project)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{score}%</Badge>
                      {reason ? <p className="text-xs text-muted-foreground mt-1">{reason}</p> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setLinkingId(transfer.id);
                          reconcileMutation.mutate({ transfer, invoice });
                        }}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 mr-1" />
                            Przypisz
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Są nierozliczone przelewy ({unmatched.length}), ale brak automatycznych sugestii — sprawdź numery FV i kwoty w module{" "}
          <span className="font-medium">Przelewy</span>.
        </p>
      )}

      {unmatched.length > 0 && suggestions.length === 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {unmatched.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 shrink-0 opacity-40" />
              {formatTransferAmount(t)} — {t.invoice_number || "brak nr FV na przelewie"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
