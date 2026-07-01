import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CreditCard, Edit2, ExternalLink, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { getUploadFilePublicUrl } from "@/lib/upload-file-url";
import {
  emptyTransfer,
  formatTransferAmount,
  listAllTransferConfirmations,
  pickTransferApiPayload,
  TRANSFER_MATCH_STATUSES,
} from "@/lib/transfer-schema";
import { displayInvoiceSeller } from "@/lib/invoice-schema";

const SOURCE_LABELS = {
  transfer: "Import przelewów",
  invoice_attachment: "Załącznik na FV",
};

export function TransferConfirmationsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState(emptyTransfer());
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: transfers = [], isLoading: loadingTransfers } = useQuery({
    queryKey: ["transfers"],
    queryFn: () => base44.entities.Transfer.list("-transfer_date"),
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });

  const invoiceById = useMemo(() => Object.fromEntries(invoices.map((i) => [i.id, i])), [invoices]);

  const allRows = useMemo(
    () => listAllTransferConfirmations(transfers, invoices),
    [transfers, invoices]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allRows;
    return allRows.filter((row) => {
      const inv = row.invoice_id ? invoiceById[row.invoice_id] : null;
      const invNum = inv?.invoice_number || row.invoice_number || "";
      const hay = [
        row.contractor_name,
        row.title,
        row.invoice_number,
        invNum,
        row.account_number,
        row.match_status,
        row.notes,
        SOURCE_LABELS[row.source],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, search, invoiceById]);

  const openEdit = (row) => {
    setEditingRow(row);
    setForm(emptyTransfer(row));
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = pickTransferApiPayload(form);

      if (editingRow?.source === "transfer" && editingRow.transferId) {
        await base44.entities.Transfer.update(editingRow.transferId, payload);
        if (payload.invoice_id && payload.invoice_id !== editingRow.invoice_id) {
          const inv = invoiceById[payload.invoice_id];
          if (inv && payload.match_status === "dopasowano") {
            await base44.entities.Invoice.update(payload.invoice_id, { status: "paid" });
          }
        }
        return;
      }

      if (editingRow?.source === "invoice_attachment" && editingRow.invoiceAttachmentInvoiceId) {
        const oldInvoiceId = editingRow.invoiceAttachmentInvoiceId;
        const newInvoiceId = form.invoice_id || oldInvoiceId;
        const fileUrl = form.file_url || "";

        if (oldInvoiceId !== newInvoiceId) {
          await base44.entities.Invoice.update(oldInvoiceId, { transfer_confirmation_url: "" });
          if (newInvoiceId) {
            await base44.entities.Invoice.update(newInvoiceId, { transfer_confirmation_url: fileUrl });
          }
        } else if (newInvoiceId) {
          await base44.entities.Invoice.update(newInvoiceId, { transfer_confirmation_url: fileUrl });
        }

        const shouldCreateTransfer =
          form.amount > 0 ||
          form.contractor_name?.trim() ||
          form.transfer_date ||
          form.title?.trim();

        if (shouldCreateTransfer) {
          await base44.entities.Transfer.create({
            ...payload,
            invoice_id: newInvoiceId || undefined,
            file_url: fileUrl || undefined,
            match_status: newInvoiceId ? payload.match_status || "przy fakturze" : payload.match_status,
          });
        }
        return;
      }

      await base44.entities.Transfer.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setEditingRow(null);
      toast.success("Zapisano potwierdzenie przelewu");
    },
    onError: (e) => toast.error(e?.message || "Nie udało się zapisać"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row) => {
      if (row.source === "transfer" && row.transferId) {
        await base44.entities.Transfer.delete(row.transferId);
        return;
      }
      if (row.source === "invoice_attachment" && row.invoiceAttachmentInvoiceId) {
        await base44.entities.Invoice.update(row.invoiceAttachmentInvoiceId, {
          transfer_confirmation_url: "",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Usunięto potwierdzenie");
    },
    onError: () => toast.error("Nie udało się usunąć"),
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file) => {
      setUploadingFile(true);
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const url = getUploadFilePublicUrl(uploadRes);
      if (!url) throw new Error("Upload nie zwrócił adresu pliku.");
      return url;
    },
    onSuccess: (url) => {
      updateField("file_url", url);
      setUploadingFile(false);
      toast.success("Plik wgrany");
    },
    onError: (e) => {
      setUploadingFile(false);
      toast.error(e?.message || "Błąd uploadu");
    },
  });

  const loading = loadingTransfers || loadingInvoices;

  return (
    <div className="space-y-4">
      <Card className="bg-background shadow-lg">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Potwierdzenia przelewów ({filtered.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Wszystkie potwierdzenia z importu Przelewy oraz załączniki wgrane przy fakturach. Możesz edytować
              dowolne pole i ręcznie przypisać fakturę.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={createPageUrl("Transfers")}>
              <Plus className="h-4 w-4 mr-1" />
              Importuj nowe (CSV/PDF)
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Szukaj: kontrahent, tytuł, nr FV, konto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Ładowanie…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              Brak potwierdzeń przelewów. Wgraj je w module{" "}
              <Link to={createPageUrl("Transfers")} className="text-primary underline">
                Przelewy
              </Link>{" "}
              lub przy pojedynczej fakturze (kolumna Przelewy).
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Kwota</TableHead>
                    <TableHead>Kontrahent</TableHead>
                    <TableHead>Tytuł</TableHead>
                    <TableHead>Nr FV (przelew)</TableHead>
                    <TableHead>Podpięta faktura</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Źródło</TableHead>
                    <TableHead>Plik</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const linked = row.invoice_id ? invoiceById[row.invoice_id] : null;
                    return (
                      <TableRow key={row.rowKey}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {row.transfer_date ? String(row.transfer_date).slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium tabular-nums">
                          {formatTransferAmount(row)}
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate" title={row.contractor_name}>
                          {row.contractor_name || "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate" title={row.title}>
                          {row.title || "—"}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{row.invoice_number || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {linked ? (
                            <span className="font-medium">{linked.invoice_number || linked.id}</span>
                          ) : row.invoice_id ? (
                            <span className="text-muted-foreground">{row.invoice_id}</span>
                          ) : (
                            "—"
                          )}
                          {linked ? (
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                              {displayInvoiceSeller(linked)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {TRANSFER_MATCH_STATUSES[row.match_status] || row.match_status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {SOURCE_LABELS[row.source] || row.source}
                        </TableCell>
                        <TableCell>
                          {row.file_url ? (
                            <a
                              href={row.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex items-center gap-1 text-xs"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Otwórz
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(row)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Usunąć to potwierdzenie przelewu?")) deleteMutation.mutate(row);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edycja potwierdzenia przelewu</DialogTitle>
            <DialogDescription>
              {editingRow?.source === "invoice_attachment"
                ? "Załącznik wgrany przy fakturze — możesz uzupełnić dane i utworzyć rekord przelewu."
                : "Rekord z modułu Przelewy — zmiany zapisują się w bazie przelewów."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div>
              <Label>Data przelewu</Label>
              <Input
                type="date"
                value={(form.transfer_date || "").slice(0, 10)}
                onChange={(e) => updateField("transfer_date", e.target.value)}
              />
            </div>
            <div>
              <Label>Kwota</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount ?? ""}
                onChange={(e) => updateField("amount", e.target.value)}
              />
            </div>
            <div>
              <Label>Waluta</Label>
              <Select value={form.currency || "PLN"} onValueChange={(v) => updateField("currency", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLN">PLN</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status dopasowania</Label>
              <Select
                value={form.match_status || "__none__"}
                onValueChange={(v) => updateField("match_status", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {Object.entries(TRANSFER_MATCH_STATUSES)
                    .filter(([k]) => k)
                    .map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Kontrahent (odbiorca)</Label>
              <Input
                value={form.contractor_name || ""}
                onChange={(e) => updateField("contractor_name", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Tytuł przelewu</Label>
              <Input value={form.title || ""} onChange={(e) => updateField("title", e.target.value)} />
            </div>
            <div>
              <Label>Nr faktury (z tytułu)</Label>
              <Input
                value={form.invoice_number || ""}
                onChange={(e) => updateField("invoice_number", e.target.value)}
              />
            </div>
            <div>
              <Label>Nr konta</Label>
              <Input
                value={form.account_number || ""}
                onChange={(e) => updateField("account_number", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Podpięta faktura (w systemie)</Label>
              <Select
                value={form.invoice_id || "__none__"}
                onValueChange={(v) => updateField("invoice_id", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz fakturę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— brak —</SelectItem>
                  {invoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number || inv.id}
                      {displayInvoiceSeller(inv) ? ` · ${displayInvoiceSeller(inv)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Płatnik</Label>
              <Input value={form.payer || ""} onChange={(e) => updateField("payer", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>URL pliku potwierdzenia</Label>
              <Input value={form.file_url || ""} onChange={(e) => updateField("file_url", e.target.value)} />
              <div className="mt-2">
                <input
                  type="file"
                  id="transfer-confirm-file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFileMutation.mutate(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingFile}
                  onClick={() => document.getElementById("transfer-confirm-file")?.click()}
                >
                  {uploadingFile ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-1" />
                  )}
                  Wgraj plik
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Uwagi</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={(e) => updateField("notes", e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingRow(null)}>
              Anuluj
            </Button>
            <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
