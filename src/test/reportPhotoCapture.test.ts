import { describe, it, expect } from "vitest";
import { countSavedReportPhotos, REPORT_PHOTO_MAX_EDGE, canSaveToPhone } from "@/lib/reportPhotoCapture";

describe("report photo capture", () => {
  it("compresses to 1600px on the long side", () => expect(REPORT_PHOTO_MAX_EDGE).toBe(1600));
  it("counts site photos and answered photo questions", () => {
    expect(countSavedReportPhotos({ _site_photo_paths: ["a", "b", "c", "d", "e"], q1: "x/y.jpg", q2: null }, ["q1", "q2"])).toBe(6);
  });
  it("hides Save to phone when sharing files is unsupported", () => {
    expect(canSaveToPhone(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBe(false);
  });
});
