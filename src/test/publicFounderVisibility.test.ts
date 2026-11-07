import { describe, expect, it } from "vitest";
import { SHOW_FOUNDER_NOTE } from "@/components/landing/landingContent";

describe("public founder note publication", () => {
  it("keeps the founder section disabled until Dale supplies approved wording", () => {
    expect(SHOW_FOUNDER_NOTE).toBe(false);
  });
});