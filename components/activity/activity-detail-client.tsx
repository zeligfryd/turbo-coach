"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import type { ActivityDetailResponse } from "@/lib/intervals/types";
import { MetricCard } from "./metric-card";
import { StreamChart } from "./stream-chart";
import { PowerCurveChart } from "./power-curve-chart";
import { IntervalsTable } from "./intervals-table";
import { ZoneDistribution } from "./zone-distribution";
import { formatDuration } from "@/lib/activity/stream-utils";

interface BasicActivity {
  id: string;
  external_id: string;
  source: string;
  name: string | null;
  type: string | null;
  activity_date: string;
  start_date_local: string | null;
  moving_time: number | null;
  distance: number | null;
  elevation_gain: number | null;
  avg_power: number | null;
  normalized_power: number | null;
  max_power: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_cadence: number | null;
  calories: number | null;
  icu_training_load: number | null;
  icu_intensity: number | null;
  icu_ftp: number | null;
  icu_atl: number | null;
  icu_ctl: number | null;
}

interface ActivityDetailClientProps {
  activityId: string;
  basicActivity: BasicActivity;
}

export function ActivityDetailClient({
  activityId,
  basicActivity: basic,
}: ActivityDetailClientProps) {
  const [detail, setDetail] = useState<ActivityDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    setLoading(true);
    fetch(`/api/activities/${activityId}/detail`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${res.status})`);
        }
        return res.json() as Promise<ActivityDetailResponse>;
      })
      .then((data) => {
        setDetail(data);
      })
      .catch((err) => {
        console.error("[ActivityDetail] Fetch error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [activityId]);

  const s = detail?.summary;
  const ftp = s?.icu_ftp ?? basic.icu_ftp;
  const np = s?.icu_weighted_avg_watts ?? basic.normalized_power;
  const ifactor = np && ftp ? (np / ftp).toFixed(2) : null;
  const tss = s?.icu_training_load ?? basic.icu_training_load;
  const vi = s?.icu_variability_index;
  const avgSpeed = s?.average_speed ? (s.average_speed * 3.6).toFixed(1) : null;
  const tsb =
    (s?.icu_ctl ?? basic.icu_ctl) != null && (s?.icu_atl ?? basic.icu_atl) != null
      ? Math.round((s?.icu_ctl ?? basic.icu_ctl)! - (s?.icu_atl ?? basic.icu_atl)!)
      : null;

  const streams = detail?.streams;
  const hasStreams = streams && (streams.watts?.length || streams.heartrate?.length);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/calendar"
          className="mt-1 p-1.5 rounded-md hover:bg-accent text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">
            {basic.name ?? basic.type ?? "Activity"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(basic.activity_date + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {basic.type && ` \u00b7 ${basic.type}`}
          </p>
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground ml-auto" />}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        <MetricCard
          label="Duration"
          value={basic.moving_time ? formatDuration(basic.moving_time) : null}
        />
        <MetricCard
          label="Distance"
          value={basic.distance ? (basic.distance / 1000).toFixed(1) : null}
          unit="km"
        />
        <MetricCard
          label="Elevation"
          value={basic.elevation_gain ? Math.round(basic.elevation_gain) : null}
          unit="m"
        />
        <MetricCard label="Avg Speed" value={avgSpeed} unit="km/h" />
        <MetricCard
          label="TSS"
          value={s ? (tss ? Math.round(tss) : null) : (basic.icu_training_load ? Math.round(basic.icu_training_load) : null)}
        />
        <MetricCard label="IF" value={s ? ifactor : null} />
        <MetricCard
          label="Avg Power"
          value={s ? s.icu_average_watts : null}
          unit="W"
        />
        <MetricCard label="NP" value={s ? np : null} unit="W" />
        <MetricCard
          label="Max Power"
          value={s?.max_watts ?? basic.max_power}
          unit="W"
        />
        <MetricCard
          label="Avg HR"
          value={s?.average_heartrate ?? basic.avg_hr}
          unit="bpm"
        />
        <MetricCard
          label="Max HR"
          value={s?.max_heartrate ?? basic.max_hr}
          unit="bpm"
        />
        <MetricCard
          label="Cadence"
          value={s?.average_cadence ?? basic.avg_cadence}
          unit="rpm"
        />
        <MetricCard
          label="Calories"
          value={s?.calories ?? basic.calories}
          unit="kcal"
        />
        <MetricCard label="VI" value={vi ? vi.toFixed(2) : null} />
        <MetricCard
          label="Power/HR"
          value={s?.icu_power_hr ? s.icu_power_hr.toFixed(2) : null}
        />
        <MetricCard
          label="Decoupling"
          value={s?.decoupling != null ? `${s.decoupling.toFixed(1)}%` : null}
        />

        {/* Advanced metrics from detail */}
        <MetricCard label="FTP" value={ftp} unit="W" />
        <MetricCard label="eFTP" value={s?.icu_pm_ftp} unit="W" />
        <MetricCard
          label="W'"
          value={
            s?.icu_pm_w_prime
              ? Math.round(s.icu_pm_w_prime / 1000)
              : s?.icu_w_prime
                ? Math.round(s.icu_w_prime / 1000)
                : null
          }
          unit="kJ"
        />
        <MetricCard
          label="Pmax"
          value={s?.icu_pm_p_max ?? s?.p_max}
          unit="W"
        />
        <MetricCard
          label="TRIMP"
          value={s?.trimp ? Math.round(s.trimp) : null}
        />
        <MetricCard
          label="HRRc"
          value={s?.icu_hrr?.hrr ?? null}
          unit="bpm"
        />
        <MetricCard
          label="Work"
          value={s?.icu_joules ? Math.round(s.icu_joules / 1000) : null}
          unit="kJ"
        />
        <MetricCard
          label="Work > FTP"
          value={s?.icu_joules_above_ftp ? Math.round(s.icu_joules_above_ftp / 1000) : null}
          unit="kJ"
        />
        <MetricCard
          label="CHO Used"
          value={s?.carbs_used}
          unit="g"
        />
        <MetricCard
          label="W'bal Drop"
          value={
            s?.icu_max_wbal_depletion
              ? Math.round(s.icu_max_wbal_depletion / 1000)
              : null
          }
          unit="kJ"
        />
        <MetricCard
          label="CTL"
          value={s?.icu_ctl != null ? Math.round(s.icu_ctl) : basic.icu_ctl != null ? Math.round(basic.icu_ctl) : null}
        />
        <MetricCard
          label="ATL"
          value={s?.icu_atl != null ? Math.round(s.icu_atl) : basic.icu_atl != null ? Math.round(basic.icu_atl) : null}
        />
        <MetricCard label="TSB" value={tsb} />
        <MetricCard
          label="Eff. Factor"
          value={s?.icu_efficiency_factor ? s.icu_efficiency_factor.toFixed(2) : null}
        />
      </div>

      {/* Charts */}
      {hasStreams && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Streams</h2>

          {streams.watts && streams.watts.length > 0 && (
            <StreamChart
              data={streams.watts}
              label="Power"
              color="#3b82f6"
              unit="W"
              height={220}
              smoothingWindow={30}
              referenceLine={ftp ? { y: ftp, label: `FTP ${ftp}W` } : undefined}
            />
          )}

          {streams.heartrate && streams.heartrate.length > 0 && (
            <StreamChart
              data={streams.heartrate}
              label="Heart Rate"
              color="#ef4444"
              unit="bpm"
              height={180}
              smoothingWindow={5}
            />
          )}

          {streams.cadence && streams.cadence.length > 0 && (
            <StreamChart
              data={streams.cadence}
              label="Cadence"
              color="#22c55e"
              unit="rpm"
              height={150}
              smoothingWindow={10}
            />
          )}

          {streams.altitude && streams.altitude.length > 0 && (
            <StreamChart
              data={streams.altitude}
              label="Altitude"
              color="#8b5cf6"
              unit="m"
              height={150}
              fillOpacity={0.5}
            />
          )}

          {streams.w_bal && streams.w_bal.length > 0 && (
            <StreamChart
              data={streams.w_bal}
              label="W' Balance"
              color="#f97316"
              unit="J"
              height={150}
            />
          )}
        </div>
      )}

      {/* Time in Zones */}
      {ftp && streams?.watts && streams.watts.length > 0 && (
        <ZoneDistribution watts={streams.watts} ftp={ftp} />
      )}

      {/* Power Curve */}
      {detail?.powerCurve && detail.powerCurve.length > 0 && (
        <PowerCurveChart data={detail.powerCurve} ftp={ftp} />
      )}

      {/* Intervals Table */}
      {detail?.intervals && detail.intervals.length > 0 && (
        <IntervalsTable intervals={detail.intervals} ftp={ftp} distanceStream={detail.streams?.distance ?? undefined} />
      )}

    </div>
  );
}
