import React from "react";
import { format } from "date-fns";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, FileDown, FileSpreadsheet } from "lucide-react";

export function ForecastModuleChrome({
  title,
  description,
  updatedAt,
  loading,
  onRefresh,
  onExportPdf,
  onExportExcel,
  children,
}) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-lg md:text-xl">{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
          <p className="text-xs text-muted-foreground mt-2">
            Ostatnia aktualizacja danych:{" "}
            {updatedAt ? format(new Date(updatedAt), "dd.MM.yyyy HH:mm") : "—"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Odśwież dane
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          children
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={onExportPdf}>
          <FileDown className="h-3.5 w-3.5" />
          Eksport PDF
        </Button>
        <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={onExportExcel}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Eksport Excel
        </Button>
      </CardFooter>
    </Card>
  );
}
