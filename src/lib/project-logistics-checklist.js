/**
 * Checklista logistyki budowy (cement PL→DE, piasek, Radlader).
 * Szablon kopiowany na każdy projekt; komentarze i daty są per obiekt.
 */

export const CHECKLIST_ITEM_STATUSES = [
  { value: "todo", label: "Do zrobienia" },
  { value: "done", label: "Zrobione" },
  { value: "na", label: "N/D" },
];

export const CHECKLIST_STATUS_LABELS = Object.fromEntries(
  CHECKLIST_ITEM_STATUSES.map((s) => [s.value, s.label])
);

/** Statyczny szablon — bez komentarzy / dat projektu. */
export const LOGISTICS_CHECKLIST_TEMPLATE = {
  version: 1,
  cement_load_date: "",
  cement_unload_date: "",
  sections: [
    {
      id: "cement",
      title: "Cement (PL → DE)",
      items: [
        { id: "cement_order", label: "Zamówienie cementu" },
        { id: "cement_transport", label: "Transport PL → DE zorganizowany" },
        { id: "cement_slot", label: "Termin i miejsce rozładunku ustalone" },
        { id: "cement_delivered", label: "Cement dostarczony na budowę" },
      ],
    },
    {
      id: "sand",
      title: "Piasek",
      items: [
        { id: "sand_order", label: "Zamówienie piasku" },
        { id: "sand_supplier", label: "Dostawca / źródło potwierdzone" },
        { id: "sand_delivered", label: "Piasek na budowie" },
      ],
    },
    {
      id: "unload",
      title: "Rozładunek tira (Radlader)",
      items: [
        { id: "radlader_booked", label: "Radlader zarezerwowany" },
        { id: "radlader_driver", label: "Kierowca Radladera potwierdzony" },
        { id: "unload_slot", label: "Slot rozładunku (data/godzina) ustalony" },
        { id: "unload_done", label: "Rozładunek wykonany" },
      ],
    },
  ],
};

function emptyItem(item) {
  return {
    id: item.id,
    label: item.label,
    status: "todo",
    comment: "",
  };
}

/** Nowa checklista skopiowana z szablonu (na projekt). */
export function createLogisticsChecklistFromTemplate() {
  return {
    version: LOGISTICS_CHECKLIST_TEMPLATE.version,
    cement_load_date: "",
    cement_unload_date: "",
    sections: LOGISTICS_CHECKLIST_TEMPLATE.sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      items: sec.items.map(emptyItem),
    })),
  };
}

export function emptyLogisticsChecklist() {
  return null;
}

/** Normalizacja zapisanych danych (stare / niepełne rekordy). */
export function normalizeLogisticsChecklist(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tpl = createLogisticsChecklistFromTemplate();
  const bySection = new Map((raw.sections || []).map((s) => [s.id, s]));

  return {
    version: 1,
    cement_load_date: raw.cement_load_date ? String(raw.cement_load_date).slice(0, 10) : "",
    cement_unload_date: raw.cement_unload_date ? String(raw.cement_unload_date).slice(0, 10) : "",
    sections: tpl.sections.map((secTpl) => {
      const saved = bySection.get(secTpl.id);
      const byItem = new Map((saved?.items || []).map((it) => [it.id, it]));
      return {
        id: secTpl.id,
        title: secTpl.title,
        items: secTpl.items.map((itemTpl) => {
          const prev = byItem.get(itemTpl.id);
          const status = ["todo", "done", "na"].includes(prev?.status) ? prev.status : "todo";
          return {
            id: itemTpl.id,
            label: itemTpl.label,
            status,
            comment: prev?.comment != null ? String(prev.comment) : "",
          };
        }),
      };
    }),
  };
}

export function checklistItemStatusLabel(status) {
  return CHECKLIST_STATUS_LABELS[status] || status || "—";
}

/** Postęp: zrobione+N/D vs wszystkie (N/D liczy się jako domknięte). */
export function logisticsChecklistProgress(checklist) {
  const normalized = normalizeLogisticsChecklist(checklist);
  if (!normalized) return { done: 0, total: 0, open: 0, label: "—" };

  let done = 0;
  let total = 0;
  for (const sec of normalized.sections) {
    for (const item of sec.items) {
      total += 1;
      if (item.status === "done" || item.status === "na") done += 1;
    }
  }
  const open = total - done;
  return {
    done,
    total,
    open,
    label: total ? `${done}/${total}` : "—",
  };
}

export function logisticsChecklistHasOpenItems(checklist) {
  return logisticsChecklistProgress(checklist).open > 0;
}

/** Otwarte pozycje (status `todo`) — do pulpitu CEO i powiadomień. */
export function listOpenLogisticsItems(checklist) {
  const normalized = normalizeLogisticsChecklist(checklist);
  if (!normalized) return [];

  const open = [];
  for (const sec of normalized.sections) {
    for (const item of sec.items) {
      if (item.status !== "todo") continue;
      open.push({
        id: item.id,
        sectionId: sec.id,
        sectionTitle: sec.title,
        label: item.label,
        comment: item.comment || "",
      });
    }
  }
  return open;
}

/**
 * Projekty z otwartą logistyką.
 * @param {{ projects?: object[], siteExtensions?: object[], siteExtensionById?: Map|Record<string, object> }} args
 */
export function projectsWithOpenLogistics({
  projects = [],
  siteExtensions = [],
  siteExtensionById = null,
} = {}) {
  const byId =
    siteExtensionById instanceof Map
      ? siteExtensionById
      : siteExtensionById && typeof siteExtensionById === "object"
        ? new Map(Object.entries(siteExtensionById))
        : null;

  const extMap = byId || new Map();
  if (!byId) {
    for (const row of siteExtensions || []) {
      if (row?.site_id) extMap.set(row.site_id, row);
    }
  }

  const rows = [];
  for (const project of projects || []) {
    if (!project?.id) continue;
    const ext = extMap.get(project.id);
    const checklist = ext?.logistics_checklist ?? null;
    const openItems = listOpenLogisticsItems(checklist);
    if (!openItems.length) continue;
    const progress = logisticsChecklistProgress(checklist);
    rows.push({
      project,
      openItems,
      progress,
      cement_load_date: normalizeLogisticsChecklist(checklist)?.cement_load_date || "",
      cement_unload_date: normalizeLogisticsChecklist(checklist)?.cement_unload_date || "",
    });
  }

  rows.sort((a, b) => b.openItems.length - a.openItems.length);
  return rows;
}
