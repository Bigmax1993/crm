import { describe, it, expect } from "vitest";
import {
  CONSTRUCTION_WORKFLOW_LABELS,
  CONSTRUCTION_WORKFLOW_STATUSES,
  constructionWorkflowLabel,
  isActiveConstructionProject,
} from "@/lib/construction-workflow";
import { activeProjectsCount } from "@/lib/finance";

describe("construction-workflow", () => {
  it("zawiera Zaplanowany jako pierwszy etap", () => {
    expect(CONSTRUCTION_WORKFLOW_STATUSES[0]).toEqual({ value: "zaplanowany", label: "Zaplanowany" });
    expect(CONSTRUCTION_WORKFLOW_LABELS.zaplanowany).toBe("Zaplanowany");
  });

  it("constructionWorkflowLabel zwraca etykietę PL", () => {
    expect(constructionWorkflowLabel("realizacja")).toBe("Realizacja");
    expect(constructionWorkflowLabel("unknown")).toBe("unknown");
  });

  it("isActiveConstructionProject — status obiegu i status obiektu", () => {
    expect(isActiveConstructionProject({ status: "aktywny", workflow_status: "realizacja" })).toBe(true);
    expect(isActiveConstructionProject({ status: "aktywny", workflow_status: "zaplanowany" })).toBe(false);
    expect(isActiveConstructionProject({ status: "aktywny", workflow_status: "zaplacono" })).toBe(false);
    expect(isActiveConstructionProject({ status: "zakończony", workflow_status: "realizacja" })).toBe(false);
    expect(isActiveConstructionProject({ status: "zawieszony", workflow_status: "oferta" })).toBe(false);
    expect(isActiveConstructionProject({ status: "aktywny" })).toBe(true);
    expect(isActiveConstructionProject({ status: "zakończony" })).toBe(false);
  });

  it("activeProjectsCount agreguje isActiveConstructionProject", () => {
    const projects = [
      { id: "1", status: "aktywny", workflow_status: "realizacja" },
      { id: "2", status: "aktywny", workflow_status: "zaplanowany" },
      { id: "3", status: "zakończony", workflow_status: "realizacja" },
    ];
    expect(activeProjectsCount(projects)).toBe(1);
  });
});
