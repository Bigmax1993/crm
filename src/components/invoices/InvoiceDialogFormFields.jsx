import React from "react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVOICE_CURRENCIES } from "@/lib/invoice-schema";

export function InvoiceDialogFormFields({ control, showNotes, isCreate }) {
  return (
    <>
      <FormField
        control={control}
        name="invoice_number"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Numer faktury</FormLabel>
            <FormControl>
              <Input {...field} placeholder="np. FV/2026/01/001" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="seller_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sprzedawca (wystawca)</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Firma wystawiająca fakturę — z bloku „Sprzedawca”" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="seller_nip"
        render={({ field }) => (
          <FormItem>
            <FormLabel>NIP sprzedawcy</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="NIP podmiotu ze „Sprzedawca”" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="contractor_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Kontrahent (nabywca)</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Druga strona — z bloku „Nabywca” (nie sprzedawca)" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="contractor_nip"
        render={({ field }) => (
          <FormItem>
            <FormLabel>NIP kontrahenta (nabywcy)</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} placeholder="NIP podmiotu z „Nabywca”" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kwota</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  {...field}
                  value={field.value === "" || field.value == null ? "" : field.value}
                  onChange={(e) => {
                    const v = e.target.value;
                    field.onChange(v === "" ? "" : v);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="amount_eur"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kwota EUR</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Opcjonalnie"
                  {...field}
                  value={field.value === "" || field.value == null ? "" : field.value}
                  onChange={(e) => {
                    const v = e.target.value;
                    field.onChange(v === "" ? "" : v);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Waluta</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {INVOICE_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="issue_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data wystawienia</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="payment_deadline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Termin płatności</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="paid_at"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {isCreate
                ? "Data zapłaty (jeśli od razu opłacona)"
                : "Data zapłaty (dla kursu płatności / różnicy kursowej)"}
            </FormLabel>
            <FormControl>
              <Input type="date" {...field} value={field.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="position"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Pozycja/Usługa/Towar</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Co było przedmiotem faktury" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {showNotes ? (
        <FormField
          control={control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notatki</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Dodatkowe uwagi do faktury" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="invoice_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Typ faktury</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="purchase">Zakupowa</SelectItem>
                  <SelectItem value="sales">Sprzedażowa</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="unpaid">Nieopłacono</SelectItem>
                  <SelectItem value="paid">Opłacono</SelectItem>
                  <SelectItem value="overdue">Przeterminowano</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
