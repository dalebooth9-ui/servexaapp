import { describe, expect, it } from "vitest";
import { plainError } from "./plainError";
describe("error reasons", () => {
  it("keeps an available specific reason", () => expect(plainError({ message: "The source file is missing." })).toBe("The source file is missing."));
  it("explains company permission failures", () => expect(plainError("permission denied for table assets")).toBe("You do not have permission to do this in your company. Ask your company administrator."));
  it("does not invent a reason when none was returned", () => expect(plainError("Error")).toBe("Something went wrong, but no reason was returned. Please try again."));
});