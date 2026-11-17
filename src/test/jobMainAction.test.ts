import { describe, it, expect } from "vitest";
import { jobMainAction } from "@/lib/jobMainAction";

describe("jobMainAction", () => {
  it("open jobs ask for the report", () => expect(jobMainAction("active")).toBe("fill_in_report"));
  it("jobs awaiting review go to the customer", () => expect(jobMainAction("pending_review")).toBe("send_to_customer"));
  it("completed jobs are invoiced", () => expect(jobMainAction("completed")).toBe("create_invoice"));
  it("cancelled jobs have no main action", () => expect(jobMainAction("cancelled")).toBeNull());
});
