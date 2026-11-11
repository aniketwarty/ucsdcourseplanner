import { describe, expect, it } from "vitest";

import { getCurrentTerm } from "./terms";

describe("getCurrentTerm", () => {
  it("uses the current term before its midpoint", () => {
    expect(getCurrentTerm(new Date(2026, 9, 30, 12)).shortLabel).toBe(
      "Fall 2026",
    );
  });

  it("switches to the upcoming term at the current term midpoint", () => {
    expect(getCurrentTerm(new Date(2026, 9, 31, 12)).shortLabel).toBe(
      "Winter 2027",
    );
  });

  it("keeps the upcoming term selected after the midpoint", () => {
    expect(getCurrentTerm(new Date(2026, 10, 10, 12)).shortLabel).toBe(
      "Winter 2027",
    );
  });
});
