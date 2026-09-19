import { afterEach, describe, expect, it, vi } from "vitest";
import { getGpsPosition, jpegFileName, stampPhoto } from "@/lib/photoStamp";

describe("photoStamp", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("burns UK date/time, job reference, and GPS into a JPEG", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T08:05:00"));
    const fillText = vi.fn();
    const context = {
      fillStyle: "", font: "", textAlign: "", textBaseline: "", shadowColor: "",
      shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
      fillRect: vi.fn(), drawImage: vi.fn(),
      measureText: (line: string) => ({ width: line.length * 10 }),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
      closePath: vi.fn(), fill: vi.fn(), fillText,
    };
    const canvas = {
      width: 0, height: 0, getContext: () => context,
      toBlob: (callback: BlobCallback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })),
    };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1200, height: 800, close: vi.fn() }));
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLCanvasElement);

    const result = await stampPhoto(new Blob(["image"], { type: "image/png" }), "VFP-00123", { lat: 51.5012345, lng: -0.1412345 });

    expect(result.type).toBe("image/jpeg");
    expect(fillText.mock.calls.map(([line]) => line)).toEqual([
      "19/09/2026 08:05", "VFP-00123", "51.501234, -0.141235",
    ]);
  });

  it("silently returns null when GPS is unavailable", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    await expect(getGpsPosition()).resolves.toBeNull();
  });

  it("normalises stamped photo names to JPEG", () => {
    expect(jpegFileName("evidence.heic")).toBe("evidence.jpg");
    expect(jpegFileName("evidence")).toBe("evidence.jpg");
  });
});