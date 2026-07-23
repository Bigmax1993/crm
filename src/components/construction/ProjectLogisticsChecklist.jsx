import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, RotateCcw } from "lucide-react";
import {
  CHECKLIST_ITEM_STATUSES,
  createLogisticsChecklistFromTemplate,
  logisticsChecklistProgress,
  normalizeLogisticsChecklist,
} from "@/lib/project-logistics-checklist";

/**
 * Checklista logistyki projektu — cement, piasek, Radlader.
 * @param {{ value: object|null, onChange: (next: object|null) => void }} props
 */
export function ProjectLogisticsChecklist({ value, onChange }) {
  const checklist = normalizeLogisticsChecklist(value);
  const progress = logisticsChecklistProgress(checklist);

  const applyTemplate = () => {
    onChange(createLogisticsChecklistFromTemplate());
  };

  const resetFromTemplate = () => {
    if (
      checklist &&
      !confirm("Zastąpić checklistę szablonem? Statusy, komentarze i daty zostaną wyzerowane.")
    ) {
      return;
    }
    applyTemplate();
  };

  const patchRoot = (partial) => {
    const base = checklist || createLogisticsChecklistFromTemplate();
    onChange({ ...base, ...partial });
  };

  const patchItem = (sectionId, itemId, partial) => {
    const base = checklist || createLogisticsChecklistFromTemplate();
    onChange({
      ...base,
      sections: base.sections.map((sec) =>
        sec.id !== sectionId
          ? sec
          : {
              ...sec,
              items: sec.items.map((it) => (it.id === itemId ? { ...it, ...partial } : it)),
            }
      ),
    });
  };

  if (!checklist) {
    return (
      <div className="rounded-lg border border-dashed border-amber-300/80 bg-amber-50/40 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ClipboardList className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Checklista logistyki</p>
            <p className="text-sm text-muted-foreground">
              Cement PL→DE, piasek, Radlader + kierowca. Wstaw szablon i odhaczaj na tym projekcie.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={applyTemplate}>
          <ClipboardList className="h-4 w-4 mr-1" />
          Wstaw checklistę z szablonu
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-background p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">Checklista logistyki</p>
          <p className="text-xs text-muted-foreground">
            Cement, piasek, rozładunek — kopiujesz szablon na każdy projekt; komentarze zostają lokalnie.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              progress.open > 0
                ? "border-amber-400 text-amber-800 bg-amber-50"
                : "border-emerald-400 text-emerald-800 bg-emerald-50"
            }
          >
            {progress.label}
          </Badge>
          <Button type="button" variant="ghost" size="sm" onClick={resetFromTemplate} title="Reset z szablonu">
            <RotateCcw className="h-4 w-4 mr-1" />
            Szablon od nowa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
        <div>
          <Label className="text-xs">Data załadunku na cementowni</Label>
          <Input
            type="date"
            value={checklist.cement_load_date || ""}
            onChange={(e) => patchRoot({ cement_load_date: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Data rozładunku na budowie</Label>
          <Input
            type="date"
            value={checklist.cement_unload_date || ""}
            onChange={(e) => patchRoot({ cement_unload_date: e.target.value })}
          />
        </div>
      </div>

      {checklist.sections.map((section) => (
        <div key={section.id} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</p>
          <div className="space-y-2">
            {section.items.map((item) => (
              <div key={item.id} className="rounded-md border bg-background p-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <Select
                    value={item.status}
                    onValueChange={(v) => patchItem(section.id, item.id, { status: v })}
                  >
                    <SelectTrigger className="w-full sm:w-[160px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHECKLIST_ITEM_STATUSES.map((st) => (
                        <SelectItem key={st.value} value={st.value}>
                          {st.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Komentarz</Label>
                  <Textarea
                    value={item.comment || ""}
                    onChange={(e) => patchItem(section.id, item.id, { comment: e.target.value })}
                    placeholder="np. kontakt, nr tira, uwagi…"
                    className="h-14 text-sm mt-1"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
