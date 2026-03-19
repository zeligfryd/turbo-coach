import type { IcuActivitySummary, IcuWellnessDay } from "./types";

const ICU_BASE_URL = "https://intervals.icu/api/v1";

function buildHeaders(apiKey: string) {
  const encoded = Buffer.from(`API_KEY:${apiKey}`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    Accept: "application/json",
  };
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createIcuClient(apiKey: string, athleteId: string) {
  const headers = buildHeaders(apiKey);

  async function validateConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${ICU_BASE_URL}/athlete/${athleteId}`, { headers });
      if (res.ok) return { ok: true };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Invalid API key or athlete ID" };
      }
      return { ok: false, error: `intervals.icu returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Network error" };
    }
  }

  async function fetchActivities(
    oldest: string,
    newest: string
  ): Promise<IcuActivitySummary[]> {
    const params = new URLSearchParams({ oldest, newest });
    const url = `${ICU_BASE_URL}/athlete/${athleteId}/activities?${params}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`intervals.icu activities returned ${res.status}`);
    }

    return (await res.json()) as IcuActivitySummary[];
  }

  async function fetchActivitiesInBatches(
    oldest: string,
    newest: string,
    batchMonths = 3
  ): Promise<IcuActivitySummary[]> {
    const all: IcuActivitySummary[] = [];
    let currentOldest = new Date(oldest);
    const end = new Date(newest);

    while (currentOldest <= end) {
      const batchEnd = new Date(currentOldest);
      batchEnd.setMonth(batchEnd.getMonth() + batchMonths);
      if (batchEnd > end) batchEnd.setTime(end.getTime());

      const batchOldest = currentOldest.toISOString().slice(0, 10);
      const batchNewest = batchEnd.toISOString().slice(0, 10);

      const batch = await fetchActivities(batchOldest, batchNewest);
      all.push(...batch);

      // Move to day after batch end to avoid overlap
      currentOldest = new Date(batchEnd);
      currentOldest.setDate(currentOldest.getDate() + 1);

      // Simple rate limiting
      if (currentOldest <= end) {
        await delay(100);
      }
    }

    return all;
  }

  async function fetchWellness(
    oldest: string,
    newest: string
  ): Promise<IcuWellnessDay[]> {
    const params = new URLSearchParams({ oldest, newest });
    const url = `${ICU_BASE_URL}/athlete/${athleteId}/wellness?${params}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`intervals.icu wellness returned ${res.status}`);
    }

    return (await res.json()) as IcuWellnessDay[];
  }

  return { validateConnection, fetchActivities, fetchActivitiesInBatches, fetchWellness };
}
