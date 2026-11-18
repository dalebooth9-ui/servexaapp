import { describe, it, expect } from "vitest";
import { namesLookAlike, findLookAlike } from "./similarName";

describe("namesLookAlike", () => {
  it("matches apostrophe differences", () => expect(namesLookAlike("Watkin's", "Watkins")).toBe(true));
  it("matches the same name with Ltd", () => expect(namesLookAlike("C Watkins Plumbing Ltd", "C Watkins Plumbing")).toBe(true));
  it("matches Limited vs Ltd", () => expect(namesLookAlike("Acme Fire Limited", "Acme Fire Ltd")).toBe(true));
  it("does not match different names", () => expect(namesLookAlike("Bristol Fire", "Newquay Fire")).toBe(false));
  it("does not match short different names", () => expect(namesLookAlike("Unit 1", "Unit 2")).toBe(false));
  it("finds the existing record", () => expect(findLookAlike("watkins", [{ name: "Other" }, { name: "Watkin's" }])?.name).toBe("Watkin's"));
});
