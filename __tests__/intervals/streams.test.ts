import { describe, it, expect, vi, afterEach } from "vitest";
import { createIcuClient } from "@/lib/intervals/client";

/**
 * intervals.icu returns streams as an array of objects carrying their own
 * `type`, not as a map keyed by stream name. Reading it the other way produced
 * streams keyed "0", "1", "2" — a shape every consumer accepts silently and
 * then renders nothing from, which is exactly how it went unnoticed while the
 * intervals.icu path was unreachable.
 */
function mockFetch(payload: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchStreams", () => {
  it("keys the real array response by stream type", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { type: "watts", name: "Power", data: [100, 200, 300] },
        { type: "heartrate", name: "Heart rate", data: [120, 130, 140] },
        { type: "cadence", name: "Cadence", data: [85, 86, 87] },
      ]),
    );

    const streams = await createIcuClient("key", "i1").fetchStreams("a1");

    expect(Object.keys(streams).sort()).toEqual(["cadence", "heartrate", "watts"]);
    expect(streams.watts).toEqual([100, 200, 300]);
    expect(streams.heartrate).toEqual([120, 130, 140]);
    // The bug: numeric keys instead of stream names.
    expect(streams["0"]).toBeUndefined();
  });

  it("skips streams with no data rather than keying them empty", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { type: "watts", data: [1, 2] },
        { type: "w_bal", data: null },
        { type: "unknown" },
      ]),
    );

    const streams = await createIcuClient("key", "i1").fetchStreams("a1");
    expect(Object.keys(streams)).toEqual(["watts"]);
  });

  it("still handles the keyed forms, in case the API shape varies", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ watts: [1, 2, 3], heartrate: { data: [4, 5, 6] } }),
    );

    const streams = await createIcuClient("key", "i1").fetchStreams("a1");
    expect(streams.watts).toEqual([1, 2, 3]);
    expect(streams.heartrate).toEqual([4, 5, 6]);
  });
});
