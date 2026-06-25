import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { financeMetricSummary } from "@/lib/finance-metric-definitions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { projectProfitabilityPln } from "@/lib/finance-pln";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";
import { getProjectDisplayName } from "@/lib/match-project";
import { resolveSiteGeocode, siteHasCoords } from "@/lib/site-geocode";
import {
  CONSTRUCTION_WORKFLOW_MAP_COLORS,
  CONSTRUCTION_WORKFLOW_STATUSES,
  constructionWorkflowLabel,
} from "@/lib/construction-workflow";
import { constructionSitePageUrl } from "@/utils";

const STATUS_COLOR = CONSTRUCTION_WORKFLOW_MAP_COLORS;

function FitBounds({ projects }) {
  const map = useMap();
  React.useEffect(() => {
    const pts = projects.filter((p) => p.latitude != null && p.longitude != null);
    if (pts.length === 0) return;
    import("leaflet").then((L) => {
      const b = L.latLngBounds(pts.map((p) => [Number(p.latitude), Number(p.longitude)]));
      map.fitBounds(b, { padding: [40, 40], maxZoom: 12 });
    });
  }, [map, projects]);
  return null;
}

export default function ProjectsMap() {
  const [filter, setFilter] = useState("all");
  const [geocodingAll, setGeocodingAll] = useState(false);
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const enriched = useClientEnrichedInvoices(invoices);

  const prof = useMemo(() => {
    const list = projectProfitabilityPln(enriched, projects);
    const m = new Map(list.map((x) => [x.project.id, x]));
    return m;
  }, [enriched, projects]);

  const filtered = useMemo(() => {
    if (filter === "all") return projects;
    return projects.filter((p) => (p.workflow_status || "") === filter);
  }, [projects, filter]);

  const withCoords = filtered.filter((p) => siteHasCoords(p));
  const missingCoords = projects.filter((p) => !siteHasCoords(p) && String(p.city ?? "").trim());

  const fillMissingCoords = async () => {
    if (!missingCoords.length) {
      toast.message("Wszystkie obiekty mają już współrzędne GPS.");
      return;
    }
    setGeocodingAll(true);
    let ok = 0;
    try {
      for (const p of missingCoords) {
        try {
          const geo = await resolveSiteGeocode(p);
          if (geo && geo.source !== "existing") {
            await base44.entities.ConstructionSite.update(p.id, {
              latitude: geo.latitude,
              longitude: geo.longitude,
              city: geo.city || p.city,
            });
            ok += 1;
          }
        } catch (e) {
          console.warn("Geocode project:", p.id, e);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["construction-sites"] });
      if (ok > 0) {
        toast.success(`Uzupełniono GPS dla ${ok} z ${missingCoords.length} obiektów.`);
      } else {
        toast.warning(
          "Nie udało się ustalić GPS. Dla Polski wybierz miasto z listy w Budowie; dla Niemiec włącz Claude w Ustawieniach AI."
        );
      }
    } finally {
      setGeocodingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center text-muted-foreground">
        <div className="h-10 w-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Mapa obiektów</h1>
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">
              Projekty z zapisanym GPS (szer. / dł. geogr. w module Budowa). Rentowność w dymku:{" "}
              {financeMetricSummary("projectProfitabilityMixedPln")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            {missingCoords.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={geocodingAll}
                onClick={fillMissingCoords}
                className="border-amber-500/30"
              >
                {geocodingAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4 mr-2" />
                )}
                Uzupełnij GPS ({missingCoords.length})
              </Button>
            ) : null}
            <div className="w-full md:w-64">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {CONSTRUCTION_WORKFLOW_STATUSES.map((st) => (
                    <SelectItem key={st.value} value={st.value}>
                      {st.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </motion.div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Podgląd</CardTitle>
            <CardDescription className="text-xs">Wynik w PLN (jak rentowność na dashboardzie CEO).</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[480px] w-full relative z-0">
              <MapContainer center={[52.1, 19.3]} zoom={6} className="h-full w-full" scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds projects={withCoords} />
                {withCoords.map((p) => {
                  const st = p.workflow_status || "oferta";
                  const color = STATUS_COLOR[st] || "#64748b";
                  const pr = prof.get(p.id);
                  return (
                    <CircleMarker
                      key={p.id}
                      center={[Number(p.latitude), Number(p.longitude)]}
                      radius={10}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.85 }}
                    >
                      <Popup closeOnClick={false}>
                        <div className="text-sm space-y-1 min-w-[200px]">
                          <p className="font-semibold">
                            <Link
                              to={constructionSitePageUrl(p.id)}
                              className="text-primary hover:underline"
                            >
                              {getProjectDisplayName(p)}
                            </Link>
                          </p>
                          <p>Klient: {p.client_name || "—"}</p>
                          <p>Budżet: {(Number(p.budget_planned) || 0).toLocaleString("pl-PL")} PLN</p>
                          <p>Status: {constructionWorkflowLabel(st)}</p>
                          <p>Rentowność: {pr ? `${pr.wynik.toLocaleString("pl-PL")} PLN` : "—"}</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>
            {withCoords.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                Brak projektów ze współrzędnymi ({projects.length} w bazie, {missingCoords.length} bez GPS). W module{" "}
                <strong>Budowa</strong> przy zapisie ustawiane jest GPS automatycznie (Polska: Open-Meteo; za granicą: Claude).
                Możesz też kliknąć <strong>Uzupełnij GPS</strong> powyżej.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
