import { describe, it, expect } from "vitest";
import { namesLookAlike, findLookAlike } from "./similarName";

describe("namesLookAlike", () => {
  it("matches apostrophe differences", () => expect(namesLookAlike("Smith's", "Smiths")).toBe(true));
  it("matches the same name with Ltd", () => expect(namesLookAlike("A Smith Plumbing Ltd", "A Smith Plumbing")).toBe(true));
  it("matches Limited vs Ltd", () => expect(namesLookAlike("Acme Fire Limited", "Acme Fire Ltd")).toBe(true));
  it("does not match different names", () => expect(namesLookAlike("Northside Fire", "Southside Fire")).toBe(false));
  it("does not match short different names", () => expect(namesLookAlike("Unit 1", "Unit 2")).toBe(false));
  it("finds the existing record", () => expect(findLookAlike("smiths", [{ name: "Other" }, { name: "Smith's" }])?.name).toBe("Smith's"));
});

import { namesLookAlike as la2 } from "./similarName";
import { it as it2, expect as ex2 } from "vitest";
it2("flags a name that is the start of an existing longer name", () => {
  ex2(la2("ZZ TEST Customer", "ZZ TEST Customer (delete me)")).toBe(true);
  ex2(la2("Apex House", "APEX HOUSE, 59-65 LOWLANDS ROAD")).toBe(true);
  ex2(la2("Smith's Ltd", "smiths limited")).toBe(true);
  ex2(la2("Apex", "Apexton House")).toBe(false);
});
