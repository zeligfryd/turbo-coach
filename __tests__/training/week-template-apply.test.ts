import { describe, it, expect, vi } from "vitest";
import { applyWeekTemplate } from "@/lib/training/service/week-templates";

/**
 * A stand-in for the two tables applyWeekTemplate touches. Only the calls it
 * actually makes are modelled, so a change in how it queries shows up here as a
 * failure rather than passing silently against a permissive mock.
 */
function fakeSupabase({
  slots,
  existingBlocks = [],
}: {
  slots: Record<string, unknown>[];
  existingBlocks?: { date: string; day_part: string; name: string | null; routine_id: string | null }[];
}) {
  const inserted: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      if (table === "week_template") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          order: () =>
            Promise.resolve({
              data: [{ id: "wt1", name: "Base week", week_template_slot: slots }],
              error: null,
            }),
        };
        return chain;
      }
      if (table === "block") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => Promise.resolve({ data: existingBlocks, error: null }),
          insert: (rows: Record<string, unknown>[]) => {
            inserted.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { client: client as never, inserted };
}

const routineSlot = (weekday: number, routineId = "r1", dayPart = "am") => ({
  id: `s${weekday}${dayPart}`,
  weekday,
  day_part: dayPart,
  routine_id: routineId,
  modality: null,
  name: null,
  duration_min: null,
  area_tags: [],
  position: 0,
  routine: { name: "Post-ride 10", est_duration_min: 10 },
});

const plainSlot = (weekday: number, name = "Yoga") => ({
  id: `p${weekday}`,
  weekday,
  day_part: "pm",
  routine_id: null,
  modality: "yoga",
  name,
  duration_min: 30,
  area_tags: [],
  position: 1,
  routine: null,
});

// Monday 10 August 2026.
const MONDAY = "2026-08-10";

describe("applyWeekTemplate", () => {
  it("lands each slot on its own weekday", async () => {
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(0), routineSlot(3)] });
    const result = await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(result.success).toBe(true);
    expect(inserted.map((r) => r.date)).toEqual(["2026-08-10", "2026-08-13"]);
  });

  it("accepts any day of the week and still starts from its Monday", async () => {
    // The calendar hands over whichever date the row represents.
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(0)] });
    await applyWeekTemplate(client, "u1", "wt1", "2026-08-13");
    expect(inserted[0].date).toBe(MONDAY);
  });

  it("takes a routine slot's name and duration from the routine", async () => {
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(1)] });
    await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(inserted[0]).toMatchObject({
      name: "Post-ride 10",
      planned_duration_min: 10,
      routine_id: "r1",
    });
  });

  it("writes a plain session with its own name and modality", async () => {
    const { client, inserted } = fakeSupabase({ slots: [plainSlot(1)] });
    await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(inserted[0]).toMatchObject({
      name: "Yoga",
      modality: "yoga",
      planned_duration_min: 30,
      routine_id: null,
    });
  });

  it("repeats across weeks, seven days apart", async () => {
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(0)] });
    const result = await applyWeekTemplate(client, "u1", "wt1", MONDAY, 3);
    expect(result.success && result.data.weeksApplied).toBe(3);
    expect(inserted.map((r) => r.date)).toEqual(["2026-08-10", "2026-08-17", "2026-08-24"]);
  });

  it("gives each week its own series id", async () => {
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(0), routineSlot(2)] });
    await applyWeekTemplate(client, "u1", "wt1", MONDAY, 2);
    const series = new Set(inserted.map((r) => r.series_id));
    expect(series.size).toBe(2);
  });

  it("skips a session already on that day rather than duplicating it", async () => {
    // Applying the same week twice is an easy mistake; it should be a no-op,
    // not a doubled week to unpick by hand.
    const { client, inserted } = fakeSupabase({
      slots: [routineSlot(0), routineSlot(3)],
      existingBlocks: [{ date: "2026-08-10", day_part: "am", name: "Post-ride 10", routine_id: "r1" }],
    });
    const result = await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(result.success && result.data).toMatchObject({ created: 1, skipped: 1 });
    expect(inserted.map((r) => r.date)).toEqual(["2026-08-13"]);
  });

  it("does not duplicate within a single apply either", async () => {
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(0), routineSlot(0)] });
    const result = await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(result.success && result.data).toMatchObject({ created: 1, skipped: 1 });
    expect(inserted).toHaveLength(1);
  });

  it("treats two sessions on the same day at different parts as distinct", async () => {
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(1), plainSlot(1)] });
    await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(inserted).toHaveLength(2);
  });

  it("creates blocks as planned, by the user, so nothing treats them as proposals", async () => {
    const { client, inserted } = fakeSupabase({ slots: [routineSlot(0)] });
    await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(inserted[0]).toMatchObject({ status: "planned", created_by: "user" });
  });

  it("refuses an empty template rather than silently doing nothing", async () => {
    const { client, inserted } = fakeSupabase({ slots: [] });
    const result = await applyWeekTemplate(client, "u1", "wt1", MONDAY);
    expect(result.success).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("clamps a silly repeat count", async () => {
    const { client } = fakeSupabase({ slots: [routineSlot(0)] });
    const result = await applyWeekTemplate(client, "u1", "wt1", MONDAY, 500);
    expect(result.success && result.data.weeksApplied).toBe(12);
  });
});

describe("toSlotRows", () => {
  it("gives every row the same columns, whatever kind of slot it is", async () => {
    // The bug this exists for: PostgREST builds a bulk insert from the union of
    // keys across the batch, so a column present on one row and omitted on
    // another is sent as an explicit NULL instead of taking its default. A
    // template mixing a routine with a yoga session failed on area_tags
    // not-null; either kind on its own saved fine.
    const { toSlotRows } = await import("@/lib/training/service/week-templates");
    const rows = toSlotRows("t1", [
      { weekday: 0, dayPart: "am", routineId: "r1" },
      { weekday: 0, dayPart: "pm", modality: "yoga", name: "Yoga", durationMin: 30, areaTags: [] },
    ]);
    const keys = rows.map((row) => Object.keys(row).sort().join(","));
    expect(new Set(keys).size).toBe(1);
  });

  it("never sends a null array for area_tags", async () => {
    const { toSlotRows } = await import("@/lib/training/service/week-templates");
    for (const row of toSlotRows("t1", [{ weekday: 2, dayPart: "am", routineId: "r1" }])) {
      expect(row.area_tags).toEqual([]);
    }
  });

  it("numbers positions per day, so two sessions on one day keep their order", async () => {
    const { toSlotRows } = await import("@/lib/training/service/week-templates");
    const rows = toSlotRows("t1", [
      { weekday: 1, dayPart: "am", routineId: "a" },
      { weekday: 1, dayPart: "pm", routineId: "b" },
      { weekday: 4, dayPart: "am", routineId: "c" },
    ]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 0]);
  });
});
