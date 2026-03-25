import { describe, it, expect } from "vitest";
import { parseGpx } from "@/lib/gpx/parser";
import {
  FLAT_ROUTE_GPX,
  SINGLE_CLIMB_GPX,
  CLIMB_DESCENT_GPX,
  MINIMUM_GPX,
  SINGLE_POINT_GPX,
  EMPTY_GPX,
  RTEPT_GPX,
  GPS_SPIKE_GPX,
  buildGpxString,
} from "../fixtures/gpx-strings";

describe("parseGpx", () => {
  describe("flat route", () => {
    it("returns all flat segments with ~0m elevation gain", () => {
      const data = parseGpx(FLAT_ROUTE_GPX);
      expect(data.totalElevationM).toBeLessThanOrEqual(5); // smoothing noise
      expect(data.segments.every((s) => s.type === "flat")).toBe(true);
    });

    it("computes correct total distance (~11km for 100 points)", () => {
      const data = parseGpx(FLAT_ROUTE_GPX);
      // 100 points × ~0.111km per step ≈ 11km
      expect(data.totalDistanceKm).toBeGreaterThan(9);
      expect(data.totalDistanceKm).toBeLessThan(13);
    });

    it("returns downsampled points", () => {
      const data = parseGpx(FLAT_ROUTE_GPX);
      expect(data.points.length).toBeLessThanOrEqual(100);
      expect(data.points.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("single climb", () => {
    it("detects at least one climb segment", () => {
      const data = parseGpx(SINGLE_CLIMB_GPX);
      const climbs = data.segments.filter((s) => s.type === "climb");
      expect(climbs.length).toBeGreaterThanOrEqual(1);
    });

    it("reports positive elevation gain", () => {
      const data = parseGpx(SINGLE_CLIMB_GPX);
      expect(data.totalElevationM).toBeGreaterThan(100);
    });
  });

  describe("climb + descent", () => {
    it("detects both climb and descent segments", () => {
      const data = parseGpx(CLIMB_DESCENT_GPX);
      const types = new Set(data.segments.map((s) => s.type));
      expect(types.has("climb")).toBe(true);
      expect(types.has("descent")).toBe(true);
    });

    it("climb segments have positive elevation gain, descent segments have 0", () => {
      const data = parseGpx(CLIMB_DESCENT_GPX);
      for (const seg of data.segments) {
        if (seg.type === "climb") {
          expect(seg.elevationGainM).toBeGreaterThan(0);
        }
        if (seg.type === "descent") {
          expect(seg.elevationGainM).toBeLessThanOrEqual(0);
        }
      }
    });
  });

  describe("minimum file (2 points)", () => {
    it("succeeds with exactly 2 points", () => {
      const data = parseGpx(MINIMUM_GPX);
      expect(data.points.length).toBeGreaterThanOrEqual(2);
      expect(data.totalDistanceKm).toBeGreaterThan(0);
    });
  });

  describe("error cases", () => {
    it("throws for single point", () => {
      expect(() => parseGpx(SINGLE_POINT_GPX)).toThrow(
        "fewer than 2 trackpoints"
      );
    });

    it("throws for empty GPX (no trackpoints)", () => {
      expect(() => parseGpx(EMPTY_GPX)).toThrow("fewer than 2 trackpoints");
    });

    it("throws for completely empty string", () => {
      expect(() => parseGpx("")).toThrow("fewer than 2 trackpoints");
    });
  });

  describe("rtept fallback", () => {
    it("parses <rtept> elements when no <trkpt> present", () => {
      const data = parseGpx(RTEPT_GPX);
      // 50 points × ~0.111km ≈ 5.4km
      expect(data.totalDistanceKm).toBeGreaterThan(3);
      expect(data.points.length).toBeGreaterThanOrEqual(2);
    });

    it("detects elevation gain from rtept points", () => {
      const data = parseGpx(RTEPT_GPX);
      // 50 points, elePerStep=3 → ~147m total gain
      expect(data.totalElevationM).toBeGreaterThan(50);
    });
  });

  describe("GPS spike smoothing", () => {
    it("smooths away a single elevation spike", () => {
      const data = parseGpx(GPS_SPIKE_GPX);
      // Without smoothing, the spike point would have ele=9999.
      // With moving-average smoothing (window=5), the spike gets reduced.
      // Max elevation should be well below the raw spike value.
      const maxEle = Math.max(...data.points.map((p) => p.ele));
      expect(maxEle).toBeLessThan(5000);
    });

    it("still has reasonable total elevation gain despite spike", () => {
      const data = parseGpx(GPS_SPIKE_GPX);
      // A flat route with one smoothed spike should have limited elevation gain
      expect(data.totalElevationM).toBeLessThan(5000);
    });
  });

  describe("segment merging", () => {
    it("merges consecutive same-type chunks into one segment", () => {
      // Build a long flat route — should produce one or few flat segments, not one per chunk
      const longFlat = buildGpxString(
        Array.from({ length: 200 }, (_, i) => ({
          lat: 45.0 + i * 0.001,
          lon: 7.0,
          ele: 200,
        }))
      );
      const data = parseGpx(longFlat);
      const flatSegments = data.segments.filter((s) => s.type === "flat");
      // 200 points × ~0.111km ≈ 22km. At 0.5km chunks that would be ~44 chunks.
      // But they should all merge into 1 flat segment.
      expect(flatSegments.length).toBeLessThanOrEqual(3);
    });
  });

  describe("segment properties", () => {
    it("all segments have required fields with valid types", () => {
      const data = parseGpx(CLIMB_DESCENT_GPX);
      for (const seg of data.segments) {
        expect(typeof seg.label).toBe("string");
        expect(seg.label.length).toBeGreaterThan(0);
        expect(typeof seg.startKm).toBe("number");
        expect(typeof seg.endKm).toBe("number");
        expect(typeof seg.distanceKm).toBe("number");
        expect(typeof seg.elevationGainM).toBe("number");
        expect(typeof seg.avgGradientPercent).toBe("number");
        expect(["climb", "descent", "flat"]).toContain(seg.type);
        expect(seg.endKm).toBeGreaterThan(seg.startKm);
        expect(seg.distanceKm).toBeGreaterThan(0);
      }
    });

    it("segments cover the full route distance", () => {
      const data = parseGpx(CLIMB_DESCENT_GPX);
      if (data.segments.length > 0) {
        const firstStart = data.segments[0].startKm;
        const lastEnd = data.segments[data.segments.length - 1].endKm;
        const segmentCoverage = lastEnd - firstStart;
        // Segments should cover most of the route (allow some tolerance for filtering)
        expect(segmentCoverage).toBeGreaterThan(data.totalDistanceKm * 0.5);
      }
    });

    it("climb labels include gradient percentage", () => {
      const data = parseGpx(SINGLE_CLIMB_GPX);
      const climbs = data.segments.filter((s) => s.type === "climb");
      for (const c of climbs) {
        expect(c.label).toContain("%");
        expect(c.avgGradientPercent).toBeGreaterThan(0);
      }
    });
  });

  describe("GpxData structure", () => {
    it("returns all required top-level fields", () => {
      const data = parseGpx(FLAT_ROUTE_GPX);
      expect(Array.isArray(data.points)).toBe(true);
      expect(Array.isArray(data.segments)).toBe(true);
      expect(typeof data.totalDistanceKm).toBe("number");
      expect(typeof data.totalElevationM).toBe("number");
    });

    it("points have cumulative distance starting at 0", () => {
      const data = parseGpx(FLAT_ROUTE_GPX);
      expect(data.points[0].distanceKm).toBe(0);
      for (let i = 1; i < data.points.length; i++) {
        expect(data.points[i].distanceKm).toBeGreaterThanOrEqual(
          data.points[i - 1].distanceKm
        );
      }
    });

    it("last point distance matches totalDistanceKm", () => {
      const data = parseGpx(FLAT_ROUTE_GPX);
      const lastPointDist = data.points[data.points.length - 1].distanceKm;
      // Allow small rounding difference
      expect(Math.abs(lastPointDist - data.totalDistanceKm)).toBeLessThan(0.2);
    });
  });
});
