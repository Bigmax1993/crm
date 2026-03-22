import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const qMocks = vi.hoisted(() => ({
  getKPI: vi.fn(),
  getCashFlow: vi.fn(),
}));

vi.mock("@/hooks/useDatabase", () => ({
  useDatabase: () => ({ ready: true, error: null }),
}));

vi.mock("@/lib/queries", () => ({
  getKPI: qMocks.getKPI,
  getCashFlow: qMocks.getCashFlow,
}));

// Izolacja od ResponsiveContainer / ResizeObserver — testuje tylko panel KPI
vi.mock("recharts", async () => {
  const R = await import("react");
  return {
    ResponsiveContainer: ({ children }) =>
      R.createElement(
        "div",
        { "data-testid": "recharts-responsive-mock", style: { width: 800, height: 400 } },
        R.Children.map(children, (child) =>
          R.isValidElement(child) ? R.cloneElement(child, { width: 800, height: 400 }) : child
        )
      ),
    LineChart: ({ children }) => R.createElement("div", { "data-testid": "line-chart-mock" }, children),
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Line: () => null,
  };
});

import { MizarSqlLocalPanel } from "@/components/dashboard/MizarSqlLocalPanel";

describe("MizarSqlLocalPanel", () => {
  beforeEach(() => {
    qMocks.getKPI.mockReset();
    qMocks.getCashFlow.mockReset();
    qMocks.getKPI.mockResolvedValue({
      aktywne_projekty: 5,
      naleznosci: 1000,
      zobowiazania: 500,
      faktury_przeterminowane: 2,
      kwota_przeterminowana: 300,
      wartosc_pipeline: 2000000,
    });
    qMocks.getCashFlow.mockResolvedValue([
      { miesiac: "2024-01", narastajace: 100, saldo: 100, wplywy: 200, wydatki: 100 },
    ]);
  });

  it("renderuje KPI po załadowaniu zapytań", async () => {
    render(<MizarSqlLocalPanel />);
    await waitFor(() => {
      expect(qMocks.getKPI).toHaveBeenCalled();
      expect(qMocks.getCashFlow).toHaveBeenCalled();
    });
    expect(screen.getByText(/Lokalna baza SQL\.js/i)).toBeInTheDocument();
    expect(screen.getByText(/Aktywne projekty/i)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
