/**
 * Performance Management Chart (PMC) calculation.
 *
 * Computes CTL (Chronic Training Load / fitness), ATL (Acute Training Load / fatigue),
 * and TSB (Training Stress Balance / form) using the true exponential EWMA formula
 * that matches intervals.icu's implementation.
 *
 * Formula (per day):
 *   CTL_today = CTL_yesterday * e^(-1/tc_ctl) + load_today * (1 - e^(-1/tc_ctl))
 *   ATL_today = ATL_yesterday * e^(-1/tc_atl) + load_today * (1 - e^(-1/tc_atl))
 *   TSB_today = CTL_today - ATL_today   (intervals.icu style: both use today's values)
 */

export type DailyLoad = {
  date: string; // YYYY-MM-DD
  load: number; // Training stress (TSS or equivalent)
};

export type FitnessDay = {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  rampRate: number | null; // Weekly CTL change (CTL today - CTL 7 days ago)
};

export type PmcOptions = {
  ctlDays?: number; // Default: 42
  atlDays?: number; // Default: 7
  seedCtl?: number; // Initial CTL (default: 0)
  seedAtl?: number; // Initial ATL (default: 0)
};

/**
 * Add one day to a YYYY-MM-DD string.
 */
function addDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the full PMC series from daily training loads.
 *
 * @param dailyLoads - Array of { date, load } sorted by date ascending.
 *   Multiple entries on the same date are NOT expected — pre-aggregate before calling.
 *   Gaps (rest days) are filled automatically with load=0.
 * @param options - Time constants and seed values.
 * @returns Array of FitnessDay, one per calendar day from first load to last load (inclusive).
 */
export function computePmc(
  dailyLoads: DailyLoad[],
  options: PmcOptions = {},
): FitnessDay[] {
  if (dailyLoads.length === 0) return [];

  const ctlTc = options.ctlDays ?? 42;
  const atlTc = options.atlDays ?? 7;
  const decayCTL = Math.exp(-1 / ctlTc);
  const decayATL = Math.exp(-1 / atlTc);

  // Build a map of date → load for O(1) lookup
  const loadMap = new Map<string, number>();
  for (const dl of dailyLoads) {
    loadMap.set(dl.date, (loadMap.get(dl.date) ?? 0) + dl.load);
  }

  const startDate = dailyLoads[0].date;
  const endDate = dailyLoads[dailyLoads.length - 1].date;

  let ctl = options.seedCtl ?? 0;
  let atl = options.seedAtl ?? 0;

  const series: FitnessDay[] = [];
  // Keep a small buffer for ramp rate (CTL 7 days ago)
  const ctlHistory: number[] = [];

  let currentDate = startDate;
  while (currentDate <= endDate) {
    const load = loadMap.get(currentDate) ?? 0;

    ctl = ctl * decayCTL + load * (1 - decayCTL);
    atl = atl * decayATL + load * (1 - decayATL);
    const tsb = ctl - atl;

    // Ramp rate: CTL change over 7 days
    const rampRate =
      ctlHistory.length >= 7 ? ctl - ctlHistory[ctlHistory.length - 7] : null;

    ctlHistory.push(ctl);

    series.push({
      date: currentDate,
      ctl: Math.round(ctl * 100) / 100,
      atl: Math.round(atl * 100) / 100,
      tsb: Math.round(tsb * 100) / 100,
      rampRate: rampRate != null ? Math.round(rampRate * 100) / 100 : null,
    });

    currentDate = addDay(currentDate);
  }

  return series;
}
