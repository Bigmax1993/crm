import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SqlLocalPanel } from "@/components/dashboard/SqlLocalPanel";

vi.mock("@/hooks/useDatabase", () => ({
  useDatabase: () => ({
    db: null,
    loading: false,
    error: null,
    runQuery: vi.fn(),
  }),
}));

describe("SqlLocalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderuje nagłówek panelu SQL", () => {
    render(<SqlLocalPanel />);
    expect(screen.getByText(/SQLite w przeglądarce/i)).toBeInTheDocument();
  });
});
