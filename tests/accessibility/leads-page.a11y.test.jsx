import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { toHaveNoViolations } from "vitest-axe/matchers";

expect.extend({ toHaveNoViolations });

import Leads from "@/pages/Leads";

describe("a11y — Leady (strona + dialog zamknięty)", () => {
  it("brak krytycznych naruszeń axe na liście", async () => {
    const { container } = render(<Leads />);
    const results = await axe(container, {
      rules: {
        "color-contrast": { enabled: false },
        "empty-table-header": { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
