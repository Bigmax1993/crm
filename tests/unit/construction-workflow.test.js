import { describe, it, expect } from "vitest";
import {
  CONSTRUCTION_WORKFLOW_LABELS,
  CONSTRUCTION_WORKFLOW_STATUSES,
  constructionWorkflowLabel,
} from "@/lib/construction-workflow";

describe("construction-workflow", () => {
  it("zawiera Zaplanowany jako pierwszy etap", () => {
    expect(CONSTRUCTION_WORKFLOW_STATUSES[0]).toEqual({ value: "zaplanowany", label: "Zaplanowany" });
    expect(CONSTRUCTION_WORKFLOW_LABELS.zaplanowany).toBe("Zaplanowany");
  });

  it("constructionWorkflowLabel zwraca etykietę PL", () => {
    expect(constructionWorkflowLabel("realizacja")).toBe("Realizacja");
    expect(constructionWorkflowLabel("unknown")).toBe("unknown");
  });
});
