import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload as UploadIcon, FileText, Loader2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { transferFingerprint } from '@/lib/duplicate-detection';
import { getUploadFilePublicUrl } from '@/lib/upload-file-url';
import { parseCSV } from '@/lib/transfers-parse';

export default function Transfers() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list(),
  });

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files));
  };

  const cleanTransfersWithLLM = async (transfers) => {
    if (transfers.length === 0) return [];

    const prompt = `Twoja rola: oczyszczanie i normalizacja wpisów z polskich (i podobnych) wyciągów bankowych przed zapisem w CRM. Zachowaj sens operacji; nie zmieniaj kwoty na inną niż wynika z danych wejściowych.

ZASADY OGÓLNE:
- Jeden wiersz wejściowy → jeden element wyjściowy (ta sama liczba sensownych przelewów co sensowne wejścia).
- Nie wymyślaj numeru faktury — invoice_number tylko gdy wynika z tytułu/opisu lub dedykowanego pola.
- Odróżnij nazwę odbiorcy od tytułu przelewu: contractor_name = podmiot (firma/osoba), title = pełny lub skrócony tytuł operacji.

1. NAZWY FIRM / KONTRAHENT:
   - Znormalizuj formy prawne: "sp. z o.o." → "Sp. z o.o.", "S.A.", "Sp.k.", "GmbH" itd.
   - Usuń powtórzenia w nazwie ("ABC ABC" → "ABC"), zbędne cudzysłowy, podwójne spacje.
   - Nie usuwaj istotnych członów nazwy (np. "24" w nazwie firmy jeśli to część marki).

2. KWOTY:
   - Zawsze liczba dodatnia (wartość bezwzględna wypływu kosztowego).
   - Format PL: "1.234,50" lub "1234,50" → 1234.50; usuń symbole walut z tekstu.
   - Zaokrąglij do 2 miejsc po przecinku.

3. DATY:
   - Wyjście: YYYY-MM-DD.
   - Wejście: DD.MM.RRRR, DD-MM-RRRR, DD/MM/RRRR, RRRR-MM-DD.
   - Jeśli data nie do odczytania — nie zgaduj roku; użyj pustego stringa i nie zwracaj sztucznej daty (schema wymaga pola — wtedy najbliższa z pola "Data" jeśli jest).

4. NUMERY FAKTUR (invoice_number):
   - Wzorce: ABC/123/2024, 12/2024, FV 123456, FV123456, Faktura nr ..., INV-2024-001, #12345.
   - Szukaj w title oraz w polach z numerem faktury jeśli istnieją w JSON wejściowym.

5. TYTUŁ (title):
   - Zachowaj treść potrzebną do audytu; usuń śmieci (nadmiarowe separatory, powielone frazy).

6. KONTA:
   - IBAN PL/EU: usuń spacje; zachowaj prefiks kraju.
   - Numery krajowe: usuń spacje i zbędne myślniki wewnątrz numeru.

7. WALUTA:
   - Tylko PLN lub EUR zgodnie z wpisem; domyślnie PLN jeśli jednoznacznie PLN.

POMIŃ / NIE TWÓRZ SZTUCZNYCH WPISÓW:
   - Prowizje bankowe, opłaty za pakiet, „PRZELEW WEWNĘTRZNY” bez kontrahenta — jeśli kwota 0 lub brak odbiorcy, pomiń w cleaned_transfers (nie duplikuj linii).

Zwróć wyłącznie poprawny JSON ze schematem.`;

    const schema = {
      type: "object",
      properties: {
        cleaned_transfers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              contractor_name: { type: "string", description: "Nazwa kontrahenta, oczyszczona i znormalizowana" },
              amount: { type: "number", description: "Kwota jako liczba dodatnia" },
              currency: { type: "string", enum: ["PLN", "EUR"], description: "Waluta" },
              transfer_date: { type: "string", description: "Data w formacie YYYY-MM-DD" },
              title: { type: "string", description: "Tytuł przelewu, oczyszczony" },
              account_number: { type: "string", description: "Numer konta, bez spacji" },
              invoice_number: { type: "string", description: "Numer faktury wyekstrahowany z tytułu lub pola" }
            },
            required: ["contractor_name", "amount", "currency", "transfer_date"]
          }
        }
      }
    };

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `${prompt}\n\nDane do oczyszczenia:\n${JSON.stringify(transfers, null, 2)}`,
      response_json_schema: schema
    });

    return result?.cleaned_transfers || transfers;
  };

  const processTransfers = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    const allTransfers = [];
    const matched = [];
    const unmatched = [];

    try {
      for (const file of files) {
        if (file.name.endsWith('.csv')) {
          const text = await file.text();
          const transfers = parseCSV(text);
          const cleaned = await cleanTransfersWithLLM(transfers);
          allTransfers.push(...cleaned);
        } else if (file.name.endsWith('.pdf')) {
          const uploadRes = await base44.integrations.Core.UploadFile({ file });
          const fileUrl = getUploadFilePublicUrl(uploadRes);
          if (!fileUrl) {
            throw new Error(
              uploadRes?.message ||
                "Upload PDF nie zwrócił adresu pliku — sprawdź integrację Base44 (tak samo jak przy uploadzie faktur)."
            );
          }

          const prompt = `Przeanalizuj dokument (potwierdzenie przelewu, wycinek z bankowości) i wyekstrahuj JEDEN zestaw pól — zwróć wyłącznie JSON zgodny ze schemą (bez markdown).

contractor_name: nazwa odbiorcy (beneficjenta), nie nadawcy. Jeśli widzisz nadawcę i odbiorcę — bierz odbiorcę płatności.

amount: kwota przelewu jako liczba dodatnia (wartość bezwzględna). Waluta w polu currency (PLN lub EUR).

transfer_date: data realizacji / data operacji jako YYYY-MM-DD (nie data wystawienia wydruku, jeśli obie są — preferuj datę księgowania przelewu).

title: tytuł / opis przelewu z dokumentu (zachowaj numer faktury w tekście jeśli jest).

account_number: numer konta odbiorcy (IBAN lub krajowy), bez spacji.

invoice_number: wyłącznie jeśli da się go jednoznacznie wyciągnąć z tytułu lub opisu (wzorce FV, nr faktury, zamówienie z numerem faktury). Pusty string jeśli brak.

Nie uzupełniaj pól domyślnymi wartościami z pamięci — tylko treść dokumentu.`;

          const schema = {
            type: "object",
            properties: {
              contractor_name: { type: "string" },
              amount: { type: "number" },
              currency: { type: "string" },
              transfer_date: { type: "string" },
              title: { type: "string" },
              account_number: { type: "string" },
              invoice_number: { type: "string" }
            }
          };

          const result = await base44.integrations.Core.InvokeLLM({
            prompt,
            file_urls: [fileUrl],
            response_json_schema: schema
          });

          if (result) {
            result.amount = Math.abs(result.amount || 0);
            result.payer = 'KANBUD Sp. z o.o. Sp.k.';
            allTransfers.push(result);
          }
        }
      }

      const existingTransfers = await base44.entities.Transfer.list();
      const existingFp = new Set(existingTransfers.map((t) => transferFingerprint(t)));
      const batchSeen = new Set();
      const toCreate = [];
      const skippedDuplicates = [];
      for (const t of allTransfers) {
        const fp = transferFingerprint(t);
        if (existingFp.has(fp) || batchSeen.has(fp)) {
          skippedDuplicates.push(t);
          continue;
        }
        batchSeen.add(fp);
        existingFp.add(fp);
        toCreate.push(t);
      }

      if (toCreate.length === 0) {
        toast.warning(
          skippedDuplicates.length
            ? `Wszystkie ${skippedDuplicates.length} przelewów to duplikaty — nic nie zapisano.`
            : 'Brak przelewów do zapisu.'
        );
        setResults({
          matched: [],
          unmatched: [],
          total: 0,
          skippedDuplicates: skippedDuplicates.length,
          totalParsed: allTransfers.length,
        });
        queryClient.invalidateQueries(['transfers']);
        return;
      }

      if (skippedDuplicates.length > 0) {
        toast.message(
          `Pominięto ${skippedDuplicates.length} zduplikowanych przelewów (w bazie lub powtórzone w imporcie). Zapisano ${toCreate.length} nowych.`
        );
      }

      await base44.entities.Transfer.bulkCreate(toCreate);

      for (const transfer of toCreate) {
        if (!transfer.invoice_number) {
          unmatched.push(transfer);
          continue;
        }

        const invoice = invoices.find(inv => 
          inv.invoice_number === transfer.invoice_number ||
          inv.invoice_number?.includes(transfer.invoice_number) ||
          transfer.invoice_number?.includes(inv.invoice_number)
        );

        if (invoice) {
           if (Math.abs(invoice.amount - transfer.amount) < 0.01) {
             // Determine status based on payment deadline for sales invoices
             let status = 'paid';
             if (invoice.invoice_type === 'sales' && invoice.payment_deadline && transfer.transfer_date) {
               if (new Date(transfer.transfer_date) > new Date(invoice.payment_deadline)) {
                 status = 'overdue';
               }
             }
             await base44.entities.Invoice.update(invoice.id, { status });
             matched.push({ invoice, transfer });
           } else if (transfer.amount < invoice.amount) {
             // For partial payments on sales invoices, also check deadline
             let status = 'partially_paid';
             if (invoice.invoice_type === 'sales' && invoice.payment_deadline && transfer.transfer_date) {
               if (new Date(transfer.transfer_date) > new Date(invoice.payment_deadline)) {
                 status = 'overdue';
               }
             }
             await base44.entities.Invoice.update(invoice.id, { status });
             matched.push({ invoice, transfer, partial: true });
           } else {
             unmatched.push(transfer);
           }
         } else {
           unmatched.push(transfer);
         }
      }

      setResults({
        matched,
        unmatched,
        total: toCreate.length,
        skippedDuplicates: skippedDuplicates.length,
        totalParsed: allTransfers.length,
      });
      queryClient.invalidateQueries(['invoices']);
      queryClient.invalidateQueries(['transfers']);

    } catch (error) {
      console.error("Error:", error);
      const msg =
        error?.data?.message ||
        error?.response?.data?.message ||
        error?.message ||
        "Błąd podczas przetwarzania plików";
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="w-full p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Potwierdzenia płatności</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Wczytaj CSV lub PDF z przelewami
          </p>
        </div>

        {!results && (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Wybierz pliki CSV lub PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-12 text-center transition-colors border-muted-foreground/25 hover:border-primary">
                  <UploadIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <Label htmlFor="file-upload-transfers" className="cursor-pointer">
                    <span className="text-primary font-medium">Wybierz pliki</span>
                    <span className="text-muted-foreground"> (CSV, PDF)</span>
                  </Label>
                  <Input
                    id="file-upload-transfers"
                    type="file"
                    accept=".csv,.pdf"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {files.length > 0 && (
                    <div className="mt-4 text-left">
                      <p className="text-sm text-muted-foreground mb-2">Wybrane pliki:</p>
                      <ul className="space-y-1 text-sm text-foreground">
                        {files.map((f, idx) => (
                          <li key={idx} className="truncate text-muted-foreground">
                            {f.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <Button
                  onClick={processTransfers}
                  disabled={files.length === 0 || processing}
                  className="w-full"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Przetwarzanie...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Przetwórz przelewy ({files.length})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {results && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Podsumowanie przetwarzania</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-foreground">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 shrink-0 text-green-600 dark:text-green-500" />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        Zapisano w bazie:{' '}
                        <span className="tabular-nums">{results.total}</span> przelewów
                      </p>
                      {results.totalParsed != null && results.totalParsed !== results.total && (
                        <p className="text-sm text-muted-foreground">
                          Wczytano z plików:{' '}
                          <span className="tabular-nums">{results.totalParsed}</span> (w tym duplikaty pominięte)
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Dopasowano do faktur:{' '}
                        <span className="tabular-nums">{results.matched.length}</span> | Niedopasowane:{' '}
                        <span className="tabular-nums">{results.unmatched.length}</span>
                        {results.skippedDuplicates > 0 && (
                          <span className="text-amber-700 dark:text-amber-500">
                            {' '}
                            | Pominięte duplikaty:{' '}
                            <span className="tabular-nums">{results.skippedDuplicates}</span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {results.matched.length > 0 && (
                    <div className="border-t border-border pt-4">
                      <h4 className="font-semibold mb-3 text-green-700 dark:text-green-400">
                        ✓ Dopasowane i opłacone:
                      </h4>
                      <div className="space-y-2">
                        {results.matched.map((m, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg border p-3 text-sm ${
                              m.partial
                                ? 'border-primary/25 bg-primary/5'
                                : 'border-green-500/20 bg-green-500/10 dark:bg-green-500/15'
                            }`}
                          >
                            <p>
                              <strong>Faktura:</strong> {m.invoice.invoice_number}
                            </p>
                            <p className="tabular-nums">
                              <strong>Kwota:</strong> {m.transfer.amount} {m.transfer.currency}
                            </p>
                            {m.partial && (
                              <p className="text-xs text-primary">
                                <strong>⚠ Zapłacona częściowo</strong>{' '}
                                <span className="tabular-nums">(Faktura: {m.invoice.amount})</span>
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">{m.invoice.contractor_name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.unmatched.length > 0 && (
                    <div className="border-t border-border pt-4">
                      <h4 className="font-semibold mb-3 text-amber-700 dark:text-amber-400">⚠ Niedopasowane:</h4>
                      <div className="space-y-2">
                        {results.unmatched.map((t, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm dark:bg-amber-500/15"
                          >
                            <p className="tabular-nums">
                              <strong>Kwota:</strong> {t.amount} {t.currency}
                            </p>
                            <p>
                              <strong>Tytuł:</strong> {t.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Nr faktury: {t.invoice_number || 'nie znaleziono'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <Button
                      onClick={() => {
                        setResults(null);
                        setFiles([]);
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      Przetwórz kolejne
                    </Button>
                    <Button onClick={() => navigate(createPageUrl('Invoices'))} className="flex-1">
                      Zobacz faktury
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}