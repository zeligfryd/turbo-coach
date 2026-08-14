import { describe, it, expect } from "vitest";
import { inferRoles, hasWorkIntervals, materialiseRoles } from "@/lib/workouts/roles";
import type { BuilderItem } from "@/lib/workouts/types";

const iv = (name: string, seconds: number, start: number, end?: number, role?: string) => ({
  type: "interval" as const,
  data: {
    name,
    durationSeconds: seconds,
    intensityPercentStart: start,
    ...(end !== undefined ? { intensityPercentEnd: end } : {}),
    ...(role ? { role: role as "work" } : {}),
  },
});

const repeat = (count: number, intervals: { name: string; durationSeconds: number; intensityPercentStart: number }[]) => ({
  type: "repeat" as const,
  data: { count, intervals },
});

/** The real shape of a threshold session in the library. */
const overUnders: BuilderItem[] = [
  iv("Warm-up", 720, 50, 80),
  repeat(2, [
    { name: "Under", durationSeconds: 120, intensityPercentStart: 88 },
    { name: "Over", durationSeconds: 60, intensityPercentStart: 100 },
  ]),
  iv("Cool-down", 600, 60, 40),
];

describe("inferRoles", () => {
  it("reads the opening ramp as a warm-up and the closing one as a cool-down", () => {
    const roles = inferRoles(overUnders);
    expect(roles[0]).toEqual(["warmup"]);
    expect(roles[2]).toEqual(["cooldown"]);
  });

  it("treats a tight repeat group as all work rather than splitting it", () => {
    // Under 88 / Over 100 are both the work; the difference is shape, not
    // effort. Calling the 88s "recovery" would exclude them from every
    // progression, which is the opposite of what over-unders are.
    expect(inferRoles(overUnders)[1]).toEqual(["work", "work"]);
  });

  it("splits a repeat group that really is work and rest", () => {
    const items: BuilderItem[] = [
      iv("Warm-up", 600, 50, 75),
      repeat(4, [
        { name: "On", durationSeconds: 180, intensityPercentStart: 118 },
        { name: "Off", durationSeconds: 180, intensityPercentStart: 50 },
      ]),
    ];
    expect(inferRoles(items)[1]).toEqual(["work", "recovery"]);
  });

  it("compares within the group, not against the whole session", () => {
    // A long easy warm-up drags a session mean down far enough that recovery
    // valleys look like work when measured against it.
    const items: BuilderItem[] = [
      iv("Warm-up", 1800, 45, 45),
      repeat(3, [
        { name: "On", durationSeconds: 300, intensityPercentStart: 105 },
        { name: "Off", durationSeconds: 300, intensityPercentStart: 55 },
      ]),
    ];
    expect(inferRoles(items)[1]).toEqual(["work", "recovery"]);
  });

  it("lets an explicit role beat the inference", () => {
    const items: BuilderItem[] = [iv("Opener", 600, 50, 80, "work")];
    expect(inferRoles(items)[0]).toEqual(["work"]);
  });

  it("calls a steady endurance ride work rather than warm-up", () => {
    // One interval, no ramp: the session is the work.
    const items: BuilderItem[] = [iv("Z2", 5400, 65)];
    expect(inferRoles(items)[0]).toEqual(["work"]);
  });

  it("handles a single-interval repeat", () => {
    const items: BuilderItem[] = [repeat(5, [{ name: "Effort", durationSeconds: 60, intensityPercentStart: 120 }])];
    expect(inferRoles(items)[0]).toEqual(["work"]);
  });

  it("returns a role for every interval, in shape", () => {
    const roles = inferRoles(overUnders);
    expect(roles).toHaveLength(3);
    expect(roles[1]).toHaveLength(2);
  });
});

describe("hasWorkIntervals", () => {
  it("is true for a normal session", () => {
    expect(hasWorkIntervals(overUnders)).toBe(true);
  });

  it("is false when everything is warm-up and cool-down", () => {
    // Nothing for an operator to act on — the derive panel needs to know.
    const items: BuilderItem[] = [iv("Warm-up", 600, 40, 60), iv("Cool-down", 600, 60, 40)];
    expect(hasWorkIntervals(items)).toBe(false);
  });
});

describe("materialiseRoles", () => {
  it("writes the inferred roles in without changing anything else", () => {
    const stamped = materialiseRoles(overUnders);
    expect(stamped[0].type === "interval" && stamped[0].data.role).toBe("warmup");
    expect(stamped[1].type === "repeat" && stamped[1].data.intervals.map((i) => i.role)).toEqual([
      "work",
      "work",
    ]);
    expect(stamped[0].type === "interval" && stamped[0].data.durationSeconds).toBe(720);
  });

  it("leaves an explicit role alone", () => {
    const items: BuilderItem[] = [iv("Opener", 600, 50, 80, "recovery")];
    const [first] = materialiseRoles(items);
    expect(first.type).toBe("interval");
    if (first.type === "interval") expect(first.data.role).toBe("recovery");
  });
});
