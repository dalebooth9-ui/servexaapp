import { describe, expect, it } from "vitest";
import { findNearestJob, formatDistance, haversineDistance, GPS_AUTO_ASSIGN_RADIUS } from "@/lib/gpsProximity";

describe("gpsProximity", () => {
  it("measures a known distance", () => {
    // ~1 km apart along a line of latitude
    const d = haversineDistance(51.5, -0.1, 51.509, -0.1);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });

  it("returns zero for the same point", () => {
    expect(haversineDistance(53.4, -2.2, 53.4, -2.2)).toBe(0);
  });

  it("finds the nearest job and skips jobs without coordinates", () => {
    const result = findNearestJob(51.5, -0.1, [
      { id: "far", site_latitude: 52.0, site_longitude: -0.1 },
      { id: "near", site_latitude: 51.501, site_longitude: -0.1 },
      { id: "unknown", site_latitude: null, site_longitude: null },
    ]);
    expect(result?.job.id).toBe("near");
    expect(result!.distance).toBeLessThan(GPS_AUTO_ASSIGN_RADIUS);
  });

  it("returns null when no job has coordinates", () => {
    expect(findNearestJob(51.5, -0.1, [{ id: "a", site_latitude: null, site_longitude: null }])).toBeNull();
  });

  it("formats distances", () => {
    expect(formatDistance(320)).toBe("320 m");
    expect(formatDistance(4200)).toBe("4.2 km");
  });
});
