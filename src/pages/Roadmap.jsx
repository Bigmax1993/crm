import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROADMAP_INTRO, ROADMAP_PHASES, PRIORITY_LABELS } from "@/lib/product-roadmap-data";

function priorityVariant(p) {
  if (p === "must") return "default";
  if (p === "should") return "secondary";
  if (p === "could") return "outline";
  return "outline";
}

export default function Roadmap() {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{ROADMAP_INTRO.title}</h1>
        <p className="mt-2 text-muted-foreground leading-relaxed">{ROADMAP_INTRO.subtitle}</p>
      </div>

      <div className="space-y-6">
        {ROADMAP_PHASES.map((phase) => (
          <Card key={phase.id} className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{phase.title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">{phase.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <ul className="space-y-4">
                {phase.items.map((item, i) => (
                  <li
                    key={`${phase.id}-${i}`}
                    className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{item.title}</p>
                      {item.priority ? (
                        <Badge variant={priorityVariant(item.priority)} className="shrink-0 text-xs">
                          {PRIORITY_LABELS[item.priority] ?? item.priority}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        Źródło danych: <code className="text-foreground/90">src/lib/product-roadmap-data.js</code> — pełny opis także w{" "}
        <code className="text-foreground/90">docs/PRODUCT_ROADMAP.md</code>.
      </p>
    </div>
  );
}
