import { describe, it, expect } from "vitest";
import { jobHeadline } from "./jobHeadline";
describe("jobHeadline", () => {
  it("shows type and site once and address once", () => {
    const h = jobHeadline("Dry riser service – MOBERLY CORE 1 – EXETER UNIVERSITY, Exeter EX4 4QJ", "MOBERLY CORE 1", "EXETER UNIVERSITY, Exeter EX4 4QJ");
    expect(h.title).toBe("Dry riser service — MOBERLY CORE 1");
    expect(h.address).toBe("EXETER UNIVERSITY, Exeter EX4 4QJ");
  });
  it("keeps the name when there is no site", () => expect(jobHeadline("Annual service", null, null).title).toBe("Annual service"));
});
