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
