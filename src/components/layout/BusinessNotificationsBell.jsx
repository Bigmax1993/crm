import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildBusinessNotifications, loadNotificationSettings } from "@/lib/business-notifications";
import { listRefundClaims, listSiteExtensions } from "@/lib/crm-entity-store";
import { useClientEnrichedInvoices } from "@/hooks/useClientEnrichedInvoices";
import { createPageUrl, constructionSitePageUrl } from "@/utils";
import { cn } from "@/lib/utils";

const SEVERITY_CLASS = {
  danger: "border-red-200 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  info: "border-border bg-muted/50 text-foreground",
};

function notificationTo(href) {
  if (!href) return createPageUrl("CEODashboard");
  const m = String(href).match(/^\/Construction\?site=(.+)$/);
  if (m) return constructionSitePageUrl(decodeURIComponent(m[1]));
  return createPageUrl(String(href).replace(/^\//, "").split("?")[0] || "CEODashboard");
}

export function BusinessNotificationsBell() {
  const [settings, setSettings] = useState(loadNotificationSettings);

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => base44.entities.Invoice.list(),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["construction-sites"],
    queryFn: () => base44.entities.ConstructionSite.list(),
  });
  const { data: refundClaims = [] } = useQuery({
    queryKey: ["refund-claims"],
    queryFn: () => listRefundClaims(),
  });
  const { data: siteExtensions = [] } = useQuery({
    queryKey: ["site-extensions"],
    queryFn: () => listSiteExtensions(),
  });

  const enriched = useClientEnrichedInvoices(invoices);

  useEffect(() => {
    const reload = () => setSettings(loadNotificationSettings());
    window.addEventListener("fakturowo-notify-settings", reload);
    return () => window.removeEventListener("fakturowo-notify-settings", reload);
  }, []);

  const notifications = useMemo(
    () =>
      buildBusinessNotifications({
        invoices: enriched,
        projects,
        refundClaims,
        siteExtensions,
        settings,
      }),
    [enriched, projects, refundClaims, siteExtensions, settings]
  );

  const dangerCount = notifications.filter((n) => n.severity === "danger").length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Powiadomienia biznesowe">
          <Bell className="h-5 w-5" />
          {notifications.length > 0 ? (
            <Badge
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center",
                dangerCount > 0 ? "bg-destructive" : "bg-amber-500"
              )}
            >
              {notifications.length > 9 ? "9+" : notifications.length}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
        <DropdownMenuLabel>Powiadomienia</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2 py-3">Brak aktywnych alertów.</p>
        ) : (
          notifications.slice(0, 12).map((n) => (
            <DropdownMenuItem key={n.id} asChild className="cursor-pointer p-0 focus:bg-transparent">
              <Link
                to={notificationTo(n.href)}
                className={cn("block w-full px-2 py-2 rounded-sm border mb-1 text-left", SEVERITY_CLASS[n.severity])}
              >
                <p className="text-xs font-semibold">{n.title}</p>
                <p className="text-xs opacity-90">{n.body}</p>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={createPageUrl("Settings")} className="text-xs text-muted-foreground">
            Ustawienia powiadomień
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
