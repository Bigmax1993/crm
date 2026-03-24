import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Security from "@/pages/Security";

describe("Security — smoke", () => {
  it("renderuje informację o wyłączonym logowaniu", () => {
    render(<Security />);
    expect(screen.getByText(/^bezpieczeństwo$/i)).toBeInTheDocument();
    expect(
      screen.getByText(/system logowania i uwierzytelniania użytkowników jest wyłączony/i)
    ).toBeInTheDocument();
  });
});
