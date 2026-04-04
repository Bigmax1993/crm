import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { financeMetricSummary } from "@/lib/finance-metric-definitions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { projectProfitabilityPln } from "@/lib/finance-pln";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";

const STATUS_COLOR = {
  oferta: "#2563eb",
  zlecenie: "#7c3aed",
  realizacja: "#d97706",
  odbior: "#0d9488",
  faktura: "#ea580c",
  zaplacono: "#16a34a",
};

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

  const withCoords = filtered.filter((p) => p.latitude != null && p.longitude != null);

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
              Projekty na mapie Polski. Rentowność w dymku: {financeMetricSummary("projectProfitabilityMixedPln")}
            </p>
          </div>
          <div className="w-full md:w-64">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="oferta">Oferta</SelectItem>
                <SelectItem value="zlecenie">Zlecenie</SelectItem>
                <SelectItem value="realizacja">Realizacja</SelectItem>
                <SelectItem value="odbior">Odbiór</SelectItem>
                <SelectItem value="faktura">Faktura</SelectItem>
                <SelectItem value="zaplacono">Zapłacono</SelectItem>
              </SelectContent>
            </Select>
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
                      <Popup>
                        <div className="text-sm space-y-1 min-w-[200px]">
                          <p className="font-semibold">{p.object_name}</p>
                          <p>Klient: {p.client_name || "—"}</p>
                          <p>Budżet: {(Number(p.budget_planned) || 0).toLocaleString("pl-PL")} PLN</p>
                          <p>Status: {st}</p>
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
                Brak projektów ze współrzędnymi. W module <strong>Budowa</strong> wybierz miejscowość z listy sugestii lub uzupełnij szer. / dł. geograficzną — zapisany obiekt pojawi się tutaj.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
