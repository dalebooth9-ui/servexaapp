import { describe, it, expect } from "vitest";
import { suggestDefectsFromReport } from "@/lib/reportDefectSuggestions";

describe("suggestDefectsFromReport", () => {
  it("finds the bracket and drain plug on VFP-00284", () => {
    const s = suggestDefectsFromReport({
      comments: "GF WALL BRACKET NEEDS RE-FITTING",
      materials_required: "drain plug",
      _site_photo_captions: ["Missing plug", "Poor install of bracket", "VFP-00284"],
      _site_photo_paths: ["a.jpg", "b.jpg", "c.jpg"],
    });
    expect(s).toHaveLength(2);
    const plug = s.find(x => /plug/i.test(x.title))!;
    const bracket = s.find(x => /bracket/i.test(x.title))!;
    expect(plug.title).toBe("Missing drain plug");
    expect(plug.materials_required).toBe("drain plug");
    expect(plug.photo).toBe("a.jpg");
    expect(bracket.title).toBe("GF wall bracket needs re-fitting");
    expect(bracket.photo).toBe("b.jpg");
  });
  it("splits a combined comment", () => {
    const s = suggestDefectsFromReport({ comments: "GF WALL BRACKET NEEDS RE-FITTING + MISSING DRAIN PLUG", materials_required: "1” drain plug" });
    expect(s).toHaveLength(2);
  });
  it("ignores clean reports", () => {
    expect(suggestDefectsFromReport({ comments: "All good", materials_required: "N/A" })).toHaveLength(0);
  });
});
