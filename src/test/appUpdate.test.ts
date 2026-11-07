import { describe, it, expect } from "vitest";
import { isOldAppCache, isNewerBuild, CHECK_INTERVAL_MS } from "@/pwa/registerSW";
import { registerDraftSaver, flushAllDrafts } from "@/lib/draftFlush";

describe("app update", () => {
  it("clears stored copies of older app builds", () => {
    expect(isOldAppCache("servexa-v4-precache-v2-https://servexaapp.com/", "servexa-v5")).toBe(true);
    expect(isOldAppCache("servexa-html", "servexa-v5")).toBe(true);
    expect(isOldAppCache("servexa-assets", "servexa-v5")).toBe(true);
  });

  it("keeps the current build and offline data caches", () => {
    expect(isOldAppCache("servexa-v5-precache-v2-https://servexaapp.com/", "servexa-v5")).toBe(false);
    expect(isOldAppCache("servexa-storage-images-v2", "servexa-v5")).toBe(false);
    expect(isOldAppCache("servexa-supabase-rest", "servexa-v5")).toBe(false);
  });

  it("treats any different deployed build number as an update", () => {
    expect(isNewerBuild("202611070930", "202611070900")).toBe(true);
    expect(isNewerBuild("202611070900", "202611070900")).toBe(false);
    expect(isNewerBuild(null, "202611070900")).toBe(false);
  });

  it("checks for updates every 5 minutes while open", () => {
    expect(CHECK_INTERVAL_MS).toBe(5 * 60 * 1000);
  });

  it("waits for open report drafts to save before updating", async () => {
    let saved = false;
    const off = registerDraftSaver(() => new Promise<void>((r) => setTimeout(() => { saved = true; r(); }, 20)));
    await flushAllDrafts();
    off();
    expect(saved).toBe(true);
  });
});
