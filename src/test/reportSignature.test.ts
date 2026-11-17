import { describe, it, expect } from "vitest";
import { isEngineerSignature } from "@/lib/reportSignature";
describe("report submit signature rule", () => {
  it("accepts an office admin's signature as the engineer sign-off", () => expect(isEngineerSignature("admin")).toBe(true));
  it("accepts an engineer signature", () => expect(isEngineerSignature("engineer")).toBe(true));
  it("never accepts a customer signature", () => expect(isEngineerSignature("customer")).toBe(false));
});
