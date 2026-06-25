import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, RotateCcw, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listRefundClaims, saveRefundClaimsAll, upsertRefundClaimEntity } from "@/lib/crm-entity-store";
import { logAuditEvent, AUDIT_ACTIONS } from "@/lib/audit-log";
import {
  REFUND_CLAIM_STATUSES,
  REFUND_OPEN_STATUSES,
  applyRefundReceiptToClaim,
  emptyRefundClaim,
  isRefundFollowUpOverdue,
  refundClaimOutstanding,
  refundClaimStatusLabel,
  sumOpenRefundClaimsPln,
} from "@/lib/refund-claims";
import {
  buildRefundReceiptExtractPrompt,
  normalizeRefundReceiptLlmResult,
  REFUND_RECEIPT_JSON_SCHEMA,
} from "@/lib/refund-receipt-extract";
import { matchIncomingTransferToRefundClaim, normalizeIncomingRefundTransfer } from "@/lib/refund-transfer-match";
import { getProjectDisplayName } from "@/lib/match-project";
import { getUploadFilePublicUrl } from "@/lib/upload-file-url";
import { createPageUrl } from "@/utils";
import { newLocalId } from "@/lib/crm-local-store";

const emptyForm = emptyRefundClaim();

export default function ExpectedRefunds() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  const uploadTargetIdRef = useRef(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const purchaseInvoices = invoices.filter((i) => i.invoice_type !== "sales");

  const reload = async () => {
    const data = await listRefundClaims();
    setRows(data);
  };

  useEffect(() => {
    reload();
    const onStorage = () => reload();
    window.addEventListener("fakturowo-crm-local", onStorage);
    return () => window.removeEventListener("fakturowo-crm-local", onStorage);
  }, []);

  const persist = async (next) => {
    setRows(next);
    await saveRefundClaimsAll(next);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      ...emptyForm,
      ...row,
      amount_paid: row.amount_paid != null ? String(row.amount_paid) : "",
      amount_expected: row.amount_expected != null ? String(row.amount_expected) : "",
      follow_up_date: row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : "",
      reported_at: row.reported_at ? String(row.reported_at).slice(0, 10) : "",
    });
    setOpen(true);
  };

  const onInvoicePick = (invoiceId) => {
    const inv = purchaseInvoices.find((i) => i.id === invoiceId);
    if (!inv) {
      setForm((f) => ({ ...f, invoice_id: invoiceId }));
      return;
    }
    setForm((f) => ({
      ...f,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number || f.invoice_number,
      supplier_name: inv.contractor_name || inv.seller_name || f.supplier_name,
      project_id: inv.project_id || f.project_id,
      amount_paid: inv.amount != null ? String(inv.amount) : f.amount_paid,
      amount_expected: inv.amount != null ? String(inv.amount) : f.amount_expected,
      currency: inv.currency || f.currency || "PLN",
    }));
  };

  const save = () => {
    if (!String(form.supplier_name || "").trim()) {
      toast.error("Podaj dostawcę");
      return;
    }
    const expected = parseFloat(form.amount_expected || form.amount_paid);
    if (!Number.isFinite(expected) || expected <= 0) {
      toast.error("Podaj kwotę do zwrotu");
      return;
    }
    const payload = {
      ...emptyForm,
      ...form,
      id: editing?.id || newLocalId("refund"),
      supplier_name: String(form.supplier_name).trim(),
      material_description: String(form.material_description || "").trim(),
      invoice_number: String(form.invoice_number || "").trim(),
      amount_paid: parseFloat(form.amount_paid) || expected,
      amount_expected: expected,
      amount_received: editing ? Number(editing.amount_received) || 0 : 0,
      receipts: editing?.receipts || [],
      updated_at: new Date().toISOString(),
      created_at: editing?.created_at || new Date().toISOString(),
    };
    if (!editing && !payload.status) payload.status = "oczekuje";

    const next = editing
      ? rows.map((r) => (r.id === editing.id ? payload : r))
      : [payload, ...rows];
    persist(next).then(() => {
      logAuditEvent({
        action: AUDIT_ACTIONS.REFUND_UPDATE,
        entity_type: "RefundClaim",
        entity_id: payload.id,
        summary: editing ? `Edycja zwrotu ${payload.supplier_name}` : `Nowy zwrot: ${payload.supplier_name}`,
        actor: "użytkownik",
      });
    });
    setOpen(false);
    toast.success(editing ? "Zaktualizowano wpis" : "Dodano oczekiwany zwrot");
  };

  const remove = (id) => {
    if (!confirm("Usunąć wpis o zwrocie?")) return;
    persist(rows.filter((r) => r.id !== id));
  };

  const statusClass = (status) => {
    const map = {
      oczekuje: "bg-amber-100 text-amber-900 border-amber-200",
      zgloszono: "bg-blue-100 text-blue-900 border-blue-200",
      czesciowy: "bg-violet-100 text-violet-900 border-violet-200",
      otrzymano: "bg-green-100 text-green-800 border-green-200",
      odrzucono: "bg-gray-100 text-gray-700 border-gray-200",
    };
    return map[status] || "bg-muted";
  };

  const triggerUpload = (claimId = null) => {
    uploadTargetIdRef.current = claimId;
    fileInputRef.current?.click();
  };

  const processRefundReceiptFile = async (file, preferredClaimId = null) => {
    if (!file) return;
    setUploadingId(preferredClaimId || "bulk");
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = getUploadFilePublicUrl(uploadRes);
      if (!fileUrl) throw new Error("Brak URL pliku po uploadzie");

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: buildRefundReceiptExtractPrompt(),
        file_urls: [fileUrl],
        response_json_schema: REFUND_RECEIPT_JSON_SCHEMA,
      });

      const normalized = normalizeRefundReceiptLlmResult(result);
      if (!normalized) {
        toast.warning(
          "Nie wykryto wpływu zwrotu na dokumentcie (może to być przelew wychodzący). Uzupełnij ręcznie."
        );
        return;
      }
      normalized.file_url = fileUrl;

      const transfer = normalizeIncomingRefundTransfer(normalized);
      const current = await listRefundClaims();
      const match = matchIncomingTransferToRefundClaim(transfer, current, {
        preferredClaimId: preferredClaimId || undefined,
      });

      if (!match) {
        toast.warning(
          `Wykryto wpływ ${transfer.amount} ${transfer.currency} od „${transfer.sender_name || "—"}”, ale brak pasującego otwartego zwrotu. Dodaj wpis ręcznie lub dopasuj dane.`
        );
        return;
      }

      const updated = applyRefundReceiptToClaim(match.claim, transfer);
      await upsertRefundClaimEntity(updated);
      await logAuditEvent({
        action: AUDIT_ACTIONS.REFUND_UPDATE,
        entity_type: "RefundClaim",
        entity_id: updated.id,
        summary: `Dopasowano potwierdzenie zwrotu do ${updated.supplier_name || "dostawcy"}`,
        actor: "użytkownik",
      });
      await reload();
      toast.success(
        `Zaktualizowano zwrot: ${refundClaimStatusLabel(updated.status)} (otrzymano łącznie ${updated.amount_received} ${updated.currency})`
      );
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Nie udało się odczytać potwierdzenia");
    } finally {
      setUploadingId(null);
      uploadTargetIdRef.current = null;
    }
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    await processRefundReceiptFile(file, uploadTargetIdRef.current);
  };

  const openTotal = sumOpenRefundClaimsPln(rows);
  const overdueCount = rows.filter((r) => isRefundFollowUpOverdue(r)).length;

  return (
    <div className="w-full p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={onFileSelected}
      />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground flex items-center gap-2">
              <RotateCcw className="h-8 w-8 text-primary" />
              Oczekiwane zwroty
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Rejestr zwrotów po rezygnacji z materiału lub usługi (np. opłacony piasek). Wgraj potwierdzenie
              przelewu PL/DE — status zaktualizuje się automatycznie po dopasowaniu kwoty i dostawcy.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => triggerUpload(null)} disabled={!!uploadingId}>
              {uploadingId === "bulk" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Wgraj potwierdzenie zwrotu
            </Button>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Dodaj ręcznie
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Do odzyskania (otwarte)</p>
              <p className="text-2xl font-bold tabular-nums">
                {openTotal.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Otwarte sprawy</p>
              <p className="text-2xl font-bold tabular-nums">
                {rows.filter((r) => REFUND_OPEN_STATUSES.has(r.status)).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Po terminie follow-up</p>
              <p className="text-2xl font-bold tabular-nums text-amber-700">{overdueCount}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6">
                Brak wpisów. Dodaj ręcznie oczekiwany zwrot lub przejdź z opłaconej faktury zakupowej.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dostawca</TableHead>
                    <TableHead>Projekt</TableHead>
                    <TableHead>FV / materiał</TableHead>
                    <TableHead className="text-right">Do zwrotu</TableHead>
                    <TableHead className="text-right">Otrzymano</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const outstanding = refundClaimOutstanding(r);
                    const overdue = isRefundFollowUpOverdue(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.supplier_name}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {r.project_id ? getProjectDisplayName(projectById[r.project_id]) : "—"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px]">
                          <div>{r.invoice_number || "—"}</div>
                          {r.material_description && (
                            <div className="text-xs text-muted-foreground truncate">{r.material_description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {outstanding.toLocaleString("pl-PL", { minimumFractionDigits: 2 })} {r.currency || "PLN"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {(Number(r.amount_received) || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={`text-sm whitespace-nowrap ${overdue ? "text-red-600 font-medium" : ""}`}>
                          {r.follow_up_date ? String(r.follow_up_date).slice(0, 10) : "—"}
                          {overdue && <span className="block text-xs">Po terminie</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusClass(r.status)}>
                            {refundClaimStatusLabel(r.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Wgraj potwierdzenie zwrotu"
                              disabled={!!uploadingId || !REFUND_OPEN_STATUSES.has(r.status)}
                              onClick={() => triggerUpload(r.id)}
                            >
                              {uploadingId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edytuj oczekiwany zwrot" : "Nowy oczekiwany zwrot"}</DialogTitle>
            <DialogDescription>
              Np. zapłacona FV za piasek, rezygnacja z dostawy — śledź kwotę do odzyskania i termin kontaktu z dostawcą.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Powiązana FV zakupowa (opcjonalnie)</Label>
              <Select value={form.invoice_id || "_none"} onValueChange={(v) => onInvoicePick(v === "_none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz fakturę" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— brak —</SelectItem>
                  {purchaseInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number || inv.id} · {inv.contractor_name || "—"} · {inv.amount} {inv.currency || "PLN"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dostawca *</Label>
              <Input
                value={form.supplier_name}
                onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                placeholder="Nazwa dostawcy"
              />
            </div>
            <div>
              <Label>Projekt</Label>
              <Select value={form.project_id || "_none"} onValueChange={(v) => setForm({ ...form, project_id: v === "_none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">—</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {getProjectDisplayName(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Numer FV</Label>
                <Input
                  value={form.invoice_number}
                  onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                />
              </div>
              <div>
                <Label>Waluta</Label>
                <Select value={form.currency || "PLN"} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Materiał / opis</Label>
              <Input
                value={form.material_description}
                onChange={(e) => setForm({ ...form, material_description: e.target.value })}
                placeholder="np. piasek 0–2 mm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Zapłacono</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount_paid}
                  onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
                />
              </div>
              <div>
                <Label>Do zwrotu *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount_expected}
                  onChange={(e) => setForm({ ...form, amount_expected: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data zgłoszenia</Label>
                <Input
                  type="date"
                  value={form.reported_at || ""}
                  onChange={(e) => setForm({ ...form, reported_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Follow-up do</Label>
                <Input
                  type="date"
                  value={form.follow_up_date || ""}
                  onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "oczekuje"} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFUND_CLAIM_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notatki</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="np. dostawca obiecał zwrot do…"
                className="h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={save}>Zapisz</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-center text-xs text-muted-foreground pb-4">
        Możesz też wgrać potwierdzenie na stronie{" "}
        <Link to={createPageUrl("Transfers")} className="text-primary underline">
          Przelewy
        </Link>{" "}
        — system spróbuje dopasować wpływ do otwartego zwrotu.
      </p>
    </div>
  );
}
