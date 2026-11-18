import { describe, it, expect } from "vitest";
import { complianceStatus } from "./complianceStatus";
const today = new Date(2026, 10, 18);
describe("complianceStatus", () => {
  it("past expiry is Expired even if saved as valid", () => expect(complianceStatus("2026-09-06", "valid", today)).toBe("expired"));
  it("within 60 days is Expiring soon", () => expect(complianceStatus("2027-01-17", "valid", today)).toBe("expiring_soon"));
  it("61 days away is Valid", () => expect(complianceStatus("2027-01-18", "expired", today)).toBe("valid"));
  it("expiring today is not yet expired", () => expect(complianceStatus("2026-11-18", "valid", today)).toBe("expiring_soon"));
  it("no expiry keeps saved status", () => expect(complianceStatus(null, "valid", today)).toBe("valid"));
});
