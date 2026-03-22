import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const dbMocks = vi.hoisted(() => ({
  initDB: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  initDB: dbMocks.initDB,
}));

import { useDatabase } from "@/hooks/useDatabase";

function Probe() {
  const { ready, error } = useDatabase();
  if (error) return <div data-testid="err">{error}</div>;
  if (!ready) return <div data-testid="load">Ładowanie</div>;
  return <div data-testid="ok">Gotowe</div>;
}

describe("useDatabase", () => {
  beforeEach(() => {
    dbMocks.initDB.mockReset();
  });

  it("ustawia ready po udanym initDB", async () => {
    dbMocks.initDB.mockResolvedValue({});
    render(<Probe />);
    expect(screen.getByTestId("load")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("ok")).toBeInTheDocument();
    });
  });

  it("ustawia error przy odrzuceniu initDB", async () => {
    dbMocks.initDB.mockRejectedValue(new Error("wasm fail"));
    render(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId("err")).toHaveTextContent("wasm fail");
    });
  });
});
