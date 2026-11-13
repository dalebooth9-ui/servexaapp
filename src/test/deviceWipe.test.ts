import { describe, it, expect } from "vitest";
import { isUnsentLocalKey } from "@/lib/deviceWipe";

describe("unsent work detection", () => {
  it("counts saved report drafts", () => { expect(isUnsentLocalKey("autosave_svr_1", '{"a":1}')).toBe(true); });
  it("counts an open report", () => { expect(isUnsentLocalKey("open_form_job1", '"tpl"')).toBe(true); });
  it("ignores empty drafts and timestamps", () => {
    expect(isUnsentLocalKey("autosave_x", "{}")).toBe(false);
    expect(isUnsentLocalKey("autosave_ts_x", "123")).toBe(false);
  });
  it("ignores unrelated settings", () => { expect(isUnsentLocalKey("planner_engineer_order", "[1]")).toBe(false); });
});
