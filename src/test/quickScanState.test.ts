import { describe, expect, it } from "vitest";

import { mergeQuickScanState } from "@/lib/quickScanState";

describe("mergeQuickScanState", () => {
  it("returns committed values when there is no draft", () => {
    expect(mergeQuickScanState({ answer: "Yes" }, null)).toEqual({ answer: "Yes" });
  });

  it("lets saved draft edits override the original scan values", () => {
    expect(
      mergeQuickScanState(
        { custom_field_1771517561119: "Yes", another_field: true },
        { custom_field_1771517561119: "N/A" },
      ),
    ).toEqual({
      custom_field_1771517561119: "N/A",
      another_field: true,
    });
  });
});