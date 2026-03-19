import type { StravaActivitySummary } from "./types";

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

  return { fetchActivitiesPage, fetchAllActivities };
}
