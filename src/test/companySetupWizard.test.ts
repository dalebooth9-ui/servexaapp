import { describe, it, expect } from "vitest";
import { stepErrors, EMPTY_SETUP, fixLine } from "@/lib/companySetupWizard";

describe("company setup wizard blockers", () => {
  it("requires company name, email and address on step 1", () => {
    expect(Object.keys(stepErrors(0, EMPTY_SETUP)).sort()).toEqual(["address", "company_name", "email"]);
    expect(stepErrors(0, EMPTY_SETUP).company_name).toBe("Company name is needed");
  });
  it("lets step 1 continue without phone or website", () => {
    expect(stepErrors(0, { ...EMPTY_SETUP, company_name: "A", address: "1 St", email: "a@b.co" })).toEqual({});
  });
  it("rejects an invalid email", () => {
    expect(stepErrors(0, { ...EMPTY_SETUP, company_name: "A", address: "1 St", email: "nope" }).email).toBeTruthy();
  });
  it("never blocks optional steps when empty", () => {
    for (const s of [1, 2, 3]) expect(stepErrors(s, EMPTY_SETUP)).toEqual({});
  });
  it("words the fix line", () => { expect(fixLine(2)).toBe("2 things to fix before you can continue"); });
});
