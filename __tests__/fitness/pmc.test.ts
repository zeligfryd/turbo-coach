import { describe, it, expect } from "vitest";
import { computePmc, type DailyLoad } from "@/lib/fitness/pmc";

// Precomputed decay constants for validation
const DECAY_CTL_42 = Math.exp(-1 / 42); // ≈ 0.97653
const DECAY_ATL_7 = Math.exp(-1 / 7); // ≈ 0.86688

describe("computePmc", () => {
  describe("empty input", () => {
    it("returns empty array for no loads", () => {
      expect(computePmc([])).toEqual([]);
    });
  });

  describe("single day", () => {
    it("computes correct values for a single load", () => {
      const loads: DailyLoad[] = [{ date: "2026-01-01", load: 100 }];
      const series = computePmc(loads);

      expect(series).toHaveLength(1);
      expect(series[0].date).toBe("2026-01-01");

      // CTL = 0 * decay + 100 * (1 - decay)
      const expectedCtl = 100 * (1 - DECAY_CTL_42);
      const expectedAtl = 100 * (1 - DECAY_ATL_7);
      const expectedTsb = expectedCtl - expectedAtl;

      expect(series[0].ctl).toBeCloseTo(expectedCtl, 1);
      expect(series[0].atl).toBeCloseTo(expectedAtl, 1);
      expect(series[0].tsb).toBeCloseTo(expectedTsb, 1);
    });

    it("ATL reacts more strongly than CTL to a single load", () => {
      const loads: DailyLoad[] = [{ date: "2026-01-01", load: 100 }];
      const series = computePmc(loads);

      // ATL time constant is shorter, so it absorbs more of the load
      expect(series[0].atl).toBeGreaterThan(series[0].ctl);
    });
  });

  describe("rest day decay", () => {
    it("CTL and ATL decay toward zero on rest days", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 100 },
        { date: "2026-01-02", load: 0 },
        { date: "2026-01-03", load: 0 },
      ];
      const series = computePmc(loads);

      expect(series[1].ctl).toBeLessThan(series[0].ctl);
      expect(series[1].atl).toBeLessThan(series[0].atl);
      expect(series[2].ctl).toBeLessThan(series[1].ctl);
      expect(series[2].atl).toBeLessThan(series[1].atl);
    });

    it("ATL decays faster than CTL on rest days", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 100 },
        { date: "2026-01-02", load: 0 },
      ];
      const series = computePmc(loads);

      const ctlDecayRate = series[1].ctl / series[0].ctl;
      const atlDecayRate = series[1].atl / series[0].atl;

      // CTL decays ~2.3% per day, ATL decays ~13.3% per day
      expect(ctlDecayRate).toBeCloseTo(DECAY_CTL_42, 2);
      expect(atlDecayRate).toBeCloseTo(DECAY_ATL_7, 2);
      expect(atlDecayRate).toBeLessThan(ctlDecayRate);
    });

    it("TSB improves on rest days (becomes less negative / more positive)", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 200 },
        { date: "2026-01-02", load: 0 },
        { date: "2026-01-03", load: 0 },
        { date: "2026-01-04", load: 0 },
      ];
      const series = computePmc(loads);

      // TSB should increase each rest day as ATL drops faster than CTL
      expect(series[1].tsb).toBeGreaterThan(series[0].tsb);
      expect(series[2].tsb).toBeGreaterThan(series[1].tsb);
      expect(series[3].tsb).toBeGreaterThan(series[2].tsb);
    });
  });

  describe("gap filling", () => {
    it("fills gaps between non-consecutive dates with zero-load days", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 100 },
        { date: "2026-01-05", load: 100 }, // 3-day gap
      ];
      const series = computePmc(loads);

      // Should have 5 days: Jan 1-5
      expect(series).toHaveLength(5);
      expect(series[0].date).toBe("2026-01-01");
      expect(series[1].date).toBe("2026-01-02");
      expect(series[2].date).toBe("2026-01-03");
      expect(series[3].date).toBe("2026-01-04");
      expect(series[4].date).toBe("2026-01-05");

      // Days 2-4 should show decay
      expect(series[1].ctl).toBeLessThan(series[0].ctl);
      expect(series[2].ctl).toBeLessThan(series[1].ctl);
      expect(series[3].ctl).toBeLessThan(series[2].ctl);

      // Day 5 should bounce back from the new load
      expect(series[4].ctl).toBeGreaterThan(series[3].ctl);
    });
  });

  describe("steady state", () => {
    it("CTL converges toward daily load with consistent training", () => {
      // 60 days of constant 100 TSS
      const loads: DailyLoad[] = Array.from({ length: 60 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`.replace(
          /2026-01-(\d+)/,
          (_, d) => {
            const dt = new Date("2026-01-01");
            dt.setDate(dt.getDate() + Number(d) - 1);
            return dt.toISOString().slice(0, 10);
          },
        ),
        load: 100,
      }));

      const series = computePmc(loads);
      const lastDay = series[series.length - 1];

      // After ~60 days of 100 TSS/day, CTL should be close to 100
      expect(lastDay.ctl).toBeGreaterThan(70);
      expect(lastDay.ctl).toBeLessThan(100);

      // ATL converges much faster (7-day tc)
      // After 60 days of 100 TSS/day, ATL should be very close to 100
      expect(lastDay.atl).toBeGreaterThan(95);

      // TSB should be near zero in steady state (CTL ≈ ATL)
      // But CTL lags, so TSB will still be slightly negative
      expect(Math.abs(lastDay.tsb)).toBeLessThan(30);
    });
  });

  describe("seed values", () => {
    it("starts from seed CTL and ATL when provided", () => {
      const loads: DailyLoad[] = [{ date: "2026-01-01", load: 0 }];
      const series = computePmc(loads, { seedCtl: 80, seedAtl: 60 });

      // With zero load, should decay from seed
      expect(series[0].ctl).toBeCloseTo(80 * DECAY_CTL_42, 1);
      expect(series[0].atl).toBeCloseTo(60 * DECAY_ATL_7, 1);
    });

    it("seed values affect the entire series", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 50 },
        { date: "2026-01-02", load: 50 },
      ];

      const noSeed = computePmc(loads);
      const withSeed = computePmc(loads, { seedCtl: 80, seedAtl: 60 });

      // Seeded values should be higher throughout
      expect(withSeed[0].ctl).toBeGreaterThan(noSeed[0].ctl);
      expect(withSeed[1].ctl).toBeGreaterThan(noSeed[1].ctl);
    });
  });

  describe("custom time constants", () => {
    it("shorter ATL window makes fatigue more reactive", () => {
      const loads: DailyLoad[] = [{ date: "2026-01-01", load: 100 }];

      const normal = computePmc(loads, { atlDays: 7 });
      const shorter = computePmc(loads, { atlDays: 4 });

      // Shorter ATL window absorbs more load on day 1
      expect(shorter[0].atl).toBeGreaterThan(normal[0].atl);
    });

    it("shorter CTL window makes fitness more reactive", () => {
      const loads: DailyLoad[] = [{ date: "2026-01-01", load: 100 }];

      const normal = computePmc(loads, { ctlDays: 42 });
      const shorter = computePmc(loads, { ctlDays: 21 });

      expect(shorter[0].ctl).toBeGreaterThan(normal[0].ctl);
    });
  });

  describe("ramp rate", () => {
    it("is null for the first 7 days (indices 0-6)", () => {
      const loads: DailyLoad[] = Array.from({ length: 8 }, (_, i) => ({
        date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
        load: 100,
      }));
      const series = computePmc(loads);

      for (let i = 0; i < 7; i++) {
        expect(series[i].rampRate).toBeNull();
      }
    });

    it("is defined from day 8 onward (index 7)", () => {
      const loads: DailyLoad[] = Array.from({ length: 10 }, (_, i) => ({
        date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
        load: 100,
      }));
      const series = computePmc(loads);

      for (let i = 7; i < series.length; i++) {
        expect(series[i].rampRate).not.toBeNull();
      }
    });

    it("is positive when training load increases", () => {
      const loads: DailyLoad[] = Array.from({ length: 14 }, (_, i) => ({
        date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
        load: 50 + i * 10, // Increasing load
      }));
      const series = computePmc(loads);

      // By day 14, ramp rate should be positive
      const last = series[series.length - 1];
      expect(last.rampRate).toBeGreaterThan(0);
    });

    it("is negative during a rest period after training", () => {
      const loads: DailyLoad[] = [
        // 7 days of training
        ...Array.from({ length: 7 }, (_, i) => ({
          date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
          load: 100,
        })),
        // 7 days of rest
        ...Array.from({ length: 7 }, (_, i) => ({
          date: new Date(2026, 0, i + 8).toISOString().slice(0, 10),
          load: 0,
        })),
      ];
      const series = computePmc(loads);

      // Last day's ramp rate should be negative (CTL declining during rest)
      const last = series[series.length - 1];
      expect(last.rampRate).toBeLessThan(0);
    });
  });

  describe("multiple loads on same date", () => {
    it("sums loads for the same date (morning + afternoon ride)", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 60 },
        { date: "2026-01-01", load: 40 },
      ];

      const combined = computePmc(loads);
      const single = computePmc([{ date: "2026-01-01", load: 100 }]);

      expect(combined[0].ctl).toBeCloseTo(single[0].ctl, 2);
      expect(combined[0].atl).toBeCloseTo(single[0].atl, 2);
    });
  });

  describe("known value verification", () => {
    it("matches hand-calculated 3-day sequence", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 100 },
        { date: "2026-01-02", load: 0 },
        { date: "2026-01-03", load: 80 },
      ];
      const series = computePmc(loads);

      // Day 1: CTL = 0 * decay + 100 * (1-decay)
      const d1Ctl = 100 * (1 - DECAY_CTL_42);
      const d1Atl = 100 * (1 - DECAY_ATL_7);

      // Day 2: rest day
      const d2Ctl = d1Ctl * DECAY_CTL_42;
      const d2Atl = d1Atl * DECAY_ATL_7;

      // Day 3: 80 TSS
      const d3Ctl = d2Ctl * DECAY_CTL_42 + 80 * (1 - DECAY_CTL_42);
      const d3Atl = d2Atl * DECAY_ATL_7 + 80 * (1 - DECAY_ATL_7);

      expect(series[0].ctl).toBeCloseTo(d1Ctl, 1);
      expect(series[0].atl).toBeCloseTo(d1Atl, 1);
      expect(series[1].ctl).toBeCloseTo(d2Ctl, 1);
      expect(series[1].atl).toBeCloseTo(d2Atl, 1);
      expect(series[2].ctl).toBeCloseTo(d3Ctl, 1);
      expect(series[2].atl).toBeCloseTo(d3Atl, 1);
      expect(series[2].tsb).toBeCloseTo(d3Ctl - d3Atl, 1);
    });
  });

  describe("output format", () => {
    it("rounds values to 2 decimal places", () => {
      const loads: DailyLoad[] = [{ date: "2026-01-01", load: 77 }];
      const series = computePmc(loads);

      // Check that values are rounded to 2 decimal places
      const ctlStr = series[0].ctl.toString();
      const decimalPart = ctlStr.split(".")[1] ?? "";
      expect(decimalPart.length).toBeLessThanOrEqual(2);
    });

    it("returns dates in YYYY-MM-DD format", () => {
      const loads: DailyLoad[] = [
        { date: "2026-01-01", load: 100 },
        { date: "2026-01-03", load: 50 },
      ];
      const series = computePmc(loads);

      for (const day of series) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });
});
