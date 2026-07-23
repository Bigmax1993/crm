import { describe, it, expect } from "vitest";
import {
  createLogisticsChecklistFromTemplate,
  logisticsChecklistProgress,
  listOpenLogisticsItems,
  normalizeLogisticsChecklist,
  projectsWithOpenLogistics,
  LOGISTICS_CHECKLIST_TEMPLATE,
} from "@/lib/project-logistics-checklist";

describe("project-logistics-checklist", () => {
  it("szablon ma cement, piasek i Radlader", () => {
    const ids = LOGISTICS_CHECKLIST_TEMPLATE.sections.map((s) => s.id);
    expect(ids).toEqual(["cement", "sand", "unload"]);
    const checklist = createLogisticsChecklistFromTemplate();
    expect(checklist.cement_load_date).toBe("");
    expect(checklist.cement_unload_date).toBe("");
    expect(checklist.sections[0].items.every((i) => i.status === "todo" && i.comment === "")).toBe(true);
  });

  it("kopiowanie szablonu daje niezależną instancję", () => {
    const a = createLogisticsChecklistFromTemplate();
    const b = createLogisticsChecklistFromTemplate();
    a.sections[0].items[0].comment = "tir 1";
    a.cement_load_date = "2026-03-12";
    expect(b.sections[0].items[0].comment).toBe("");
    expect(b.cement_load_date).toBe("");
  });

  it("normalize zachowuje status, komentarz i daty", () => {
    const raw = createLogisticsChecklistFromTemplate();
    raw.cement_load_date = "2026-04-01";
    raw.cement_unload_date = "2026-04-02";
    raw.sections[0].items[0].status = "done";
    raw.sections[0].items[0].comment = "OK";
    const n = normalizeLogisticsChecklist(raw);
    expect(n.cement_load_date).toBe("2026-04-01");
    expect(n.cement_unload_date).toBe("2026-04-02");
    expect(n.sections[0].items[0].status).toBe("done");
    expect(n.sections[0].items[0].comment).toBe("OK");
  });

  it("progress liczy done + N/D jako domknięte", () => {
    const c = createLogisticsChecklistFromTemplate();
    expect(logisticsChecklistProgress(c).label).toBe("0/11");
    c.sections[0].items[0].status = "done";
    c.sections[0].items[1].status = "na";
    const p = logisticsChecklistProgress(c);
    expect(p.done).toBe(2);
    expect(p.open).toBe(9);
    expect(p.label).toBe("2/11");
  });

  it("normalize(null) → null", () => {
    expect(normalizeLogisticsChecklist(null)).toBeNull();
    expect(logisticsChecklistProgress(null).label).toBe("—");
  });

  it("listOpenLogisticsItems pomija done i N/D", () => {
    const c = createLogisticsChecklistFromTemplate();
    c.sections[0].items[0].status = "done";
    c.sections[0].items[1].status = "na";
    c.sections[0].items[2].comment = "tir jutro";
    const open = listOpenLogisticsItems(c);
    expect(open).toHaveLength(9);
    expect(open.find((i) => i.id === "cement_slot")?.comment).toBe("tir jutro");
  });

  it("projectsWithOpenLogistics łączy projekt z extension", () => {
    const c = createLogisticsChecklistFromTemplate();
    const rows = projectsWithOpenLogistics({
      projects: [
        { id: "a", object_name: "A" },
        { id: "b", object_name: "B" },
      ],
      siteExtensions: [
        { site_id: "a", logistics_checklist: c },
        { site_id: "b", logistics_checklist: null },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].project.id).toBe("a");
    expect(rows[0].openItems).toHaveLength(11);
  });
});
