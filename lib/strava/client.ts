import type { StravaActivitySummary, StravaActivityDetail, StravaStreams } from "./types";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export function createStravaClient(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  async function fetchActivitiesPage(
    after?: number,
    before?: number,
    page = 1,
    perPage = 200
  ): Promise<StravaActivitySummary[]> {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (after != null) params.set("after", String(after));
    if (before != null) params.set("before", String(before));

    const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
      headers,
    });

    if (!res.ok) {
      throw new Error(`Strava API returned ${res.status}`);
    }

    return (await res.json()) as StravaActivitySummary[];
  }

  async function fetchAllActivities(
    oldest: Date,
    newest: Date
  ): Promise<StravaActivitySummary[]> {
    const after = Math.floor(oldest.getTime() / 1000);
    const before = Math.floor(newest.getTime() / 1000);
    const all: StravaActivitySummary[] = [];
    let page = 1;

    while (true) {
      const batch = await fetchActivitiesPage(after, before, page, 200);
      all.push(...batch);
      if (batch.length < 200) break;
      page += 1;
    }

    return all;
  }

  async function fetchActivityDetail(activityId: string | number): Promise<StravaActivityDetail> {
    const res = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Strava activity detail returned ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as StravaActivityDetail;
  }

  async function fetchActivityStreams(
    activityId: string | number,
    keys: string[] = ["time", "watts", "heartrate", "cadence", "altitude", "velocity_smooth", "distance"]
  ): Promise<StravaStreams> {
    const params = new URLSearchParams({
      keys: keys.join(","),
      key_type: "time",
    });
    const res = await fetch(
      `${STRAVA_API_BASE}/activities/${activityId}/streams?${params}`,
      { headers }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Strava streams returned ${res.status}: ${body.slice(0, 200)}`);
    }
    // Strava returns an array of { type, data, ... } objects
    const raw = (await res.json()) as Array<{ type: string; data: number[] }>;
    const result: StravaStreams = {};
    for (const stream of raw) {
      (result as Record<string, number[]>)[stream.type] = stream.data;
    }
    return result;
  }

  return { fetchActivitiesPage, fetchAllActivities, fetchActivityDetail, fetchActivityStreams };
}
