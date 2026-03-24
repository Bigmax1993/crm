import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Roadmap from "@/pages/Roadmap";

describe("Roadmap — smoke (strona planu produktowego)", () => {
  it("renderuje nagłówek, fazy i stopkę ze ścieżką do źródła danych", () => {
    render(<Roadmap />);

    expect(screen.getByRole("heading", { name: /kierunki rozwoju/i })).toBeInTheDocument();
    expect(screen.getByText(/Priorytet \(wysoki zwrot z wysiłkiem\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Budowa: harmonogram, podwykonawcy, magazyn/i)).toBeInTheDocument();
    expect(screen.getByText(/product-roadmap-data\.js/i)).toBeInTheDocument();
  });
});
