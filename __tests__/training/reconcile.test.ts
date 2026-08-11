import { describe, it, expect } from "vitest";
import { matchPlannedToRides, isMissed, type PlannedRow, type RiddenRow } from "@/lib/training/reconcile";

const plan = (over: Partial<PlannedRow> = {}): PlannedRow => ({
  id: "p1",
  scheduled_date: "2026-05-20",
  day_part: "am",
  created_at: "2026-05-01T09:00:00Z",
  ...over,
});

const ride = (over: Partial<RiddenRow> = {}): RiddenRow => ({
  id: "a1",
  activity_date: "2026-05-20",
  moving_time: 3600,
  ...over,
});

describe("matchPlannedToRides", () => {
  it("settles a planned session with the ride recorded that day", () => {
    expect(matchPlannedToRides([plan()], [ride()])).toEqual([
      { scheduledWorkoutId: "p1", activityId: "a1" },
    ]);
  });

  it("leaves a planned session alone when nothing was ridden", () => {
    expect(matchPlannedToRides([plan()], [ride({ activity_date: "2026-05-21" })])).toEqual([]);
  });

  it("never lets one ride satisfy two planned sessions", () => {
    // The real failure this guards: claiming a day's whole plan was done
    // because a single ride landed would overstate the record.
    const pairs = matchPlannedToRides(
      [plan({ id: "am", day_part: "am" }), plan({ id: "pm", day_part: "pm" })],
      [ride()],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].scheduledWorkoutId).toBe("am");
  });

  it("pairs the main session with the longest ride of the day", () => {
    const pairs = matchPlannedToRides(
      [plan({ id: "am", day_part: "am" }), plan({ id: "pm", day_part: "pm" })],
      [ride({ id: "spin", moving_time: 1200 }), ride({ id: "long", moving_time: 7200 })],
    );
    expect(pairs).toEqual([
      { scheduledWorkoutId: "am", activityId: "long" },
      { scheduledWorkoutId: "pm", activityId: "spin" },
    ]);
  });

  it("never pairs across days", () => {
    const pairs = matchPlannedToRides(
      [plan({ id: "mon", scheduled_date: "2026-05-18" }), plan({ id: "wed", scheduled_date: "2026-05-20" })],
      [ride({ id: "wedride", activity_date: "2026-05-20" })],
    );
    expect(pairs).toEqual([{ scheduledWorkoutId: "wed", activityId: "wedride" }]);
  });

  it("is stable, so a second pass produces the same pairing", () => {
    const planned = [plan({ id: "b", created_at: "2026-05-02T09:00:00Z" }), plan({ id: "a" })];
    const rides = [ride({ id: "x", moving_time: 1000 }), ride({ id: "y", moving_time: 5000 })];
    expect(matchPlannedToRides(planned, rides)).toEqual(matchPlannedToRides(planned, rides));
  });

  it("handles the empty cases without throwing", () => {
    expect(matchPlannedToRides([], [ride()])).toEqual([]);
    expect(matchPlannedToRides([plan()], [])).toEqual([]);
  });
});

describe("isMissed", () => {
  it("is true for a planned session whose day has passed", () => {
    expect(isMissed("2026-05-19", "planned", "2026-05-20")).toBe(true);
  });

  it("is false today and in the future — there is still time", () => {
    expect(isMissed("2026-05-20", "planned", "2026-05-20")).toBe(false);
    expect(isMissed("2026-05-21", "planned", "2026-05-20")).toBe(false);
  });

  it("is false once the session has been settled", () => {
    expect(isMissed("2026-05-19", "done", "2026-05-20")).toBe(false);
  });
});
