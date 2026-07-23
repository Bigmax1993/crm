import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectLogisticsChecklist } from "@/components/construction/ProjectLogisticsChecklist";
import { createLogisticsChecklistFromTemplate } from "@/lib/project-logistics-checklist";

describe("ProjectLogisticsChecklist", () => {
  it("bez wartości pokazuje przycisk wstawienia szablonu", () => {
    const onChange = vi.fn();
    render(<ProjectLogisticsChecklist value={null} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /wstaw checklistę z szablonu/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /wstaw checklistę z szablonu/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0];
    expect(next.sections.map((s) => s.id)).toEqual(["cement", "sand", "tiles", "unload"]);
  });

  it("z checklistą pokazuje postęp i sekcję Płytki", () => {
    const value = createLogisticsChecklistFromTemplate();
    value.sections[0].items[0].status = "done";
    render(<ProjectLogisticsChecklist value={value} onChange={vi.fn()} />);
    expect(screen.getByText("1/15")).toBeInTheDocument();
    expect(screen.getByText("Płytki")).toBeInTheDocument();
    expect(screen.getByText("Zamówienie płytek")).toBeInTheDocument();
    expect(screen.getByText(/data załadunku na cementowni/i)).toBeInTheDocument();
  });

  it("komentarz wywołuje onChange", () => {
    const onChange = vi.fn();
    const value = createLogisticsChecklistFromTemplate();
    render(<ProjectLogisticsChecklist value={value} onChange={onChange} />);
    const areas = screen.getAllByPlaceholderText(/kontakt|tir|uwagi/i);
    fireEvent.change(areas[0], { target: { value: "Viktor +48" } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)[0];
    expect(next.sections[0].items[0].comment).toBe("Viktor +48");
  });
});
