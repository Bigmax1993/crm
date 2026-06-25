/** Status obiegu obiektu budowlanego (workflow). */
export const CONSTRUCTION_WORKFLOW_STATUSES = [
  { value: "zaplanowany", label: "Zaplanowany" },
  { value: "oferta", label: "Oferta" },
  { value: "zlecenie", label: "Zlecenie" },
  { value: "realizacja", label: "Realizacja" },
  { value: "odbior", label: "Odbiór" },
  { value: "faktura", label: "Faktura" },
  { value: "zaplacono", label: "Zapłacono" },
];

export const CONSTRUCTION_WORKFLOW_LABELS = Object.fromEntries(
  CONSTRUCTION_WORKFLOW_STATUSES.map((s) => [s.value, s.label])
);

export const CONSTRUCTION_WORKFLOW_MAP_COLORS = {
  zaplanowany: "#6366f1",
  oferta: "#2563eb",
  zlecenie: "#7c3aed",
  realizacja: "#d97706",
  odbior: "#0d9488",
  faktura: "#ea580c",
  zaplacono: "#16a34a",
};

export function constructionWorkflowLabel(status) {
  return CONSTRUCTION_WORKFLOW_LABELS[status] || status || "—";
}

/** Etapy zakończone lub jeszcze nieuruchomione — nie wliczamy do „aktywnych projektów”. */
export const CONSTRUCTION_INACTIVE_WORKFLOW_STATUSES = ["zaplanowany", "zaplacono"];

const INACTIVE_SITE_STATUSES = new Set(["zakończony", "zawieszony"]);

/** Czy obiekt budowlany jest aktywny (Pulpit CEO, statystyki). */
export function isActiveConstructionProject(project) {
  if (!project) return false;
  const siteStatus = project.status;
  if (INACTIVE_SITE_STATUSES.has(siteStatus)) return false;

  const workflow = project.workflow_status;
  if (workflow && CONSTRUCTION_INACTIVE_WORKFLOW_STATUSES.includes(workflow)) return false;

  if (workflow) return true;
  return siteStatus === "aktywny";
}
