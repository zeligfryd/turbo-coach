"use client";

import { useState, useEffect } from "react";
import { Loader2, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import type { PowerCurvePoint, PowerProfile } from "@/lib/power/types";

const GlobalPowerCurveChart = dynamic(
  () => import("./global-power-curve-chart").then((mod) => ({ default: mod.GlobalPowerCurveChart })),
  { ssr: false, loading: () => <div className="h-[350px] flex items-center justify-center text-muted-foreground">Loading chart...</div> }
);

const PowerProfileRadar = dynamic(
  () => import("./power-profile-radar").then((mod) => ({ default: mod.PowerProfileRadar })),
  { ssr: false, loading: () => <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading chart...</div> }
);

interface PerformanceClientProps {
  userFtp: number | null;
  userWeight: number | null;
}

type ApiResponse = {
  allTime: PowerCurvePoint[];
  last42d: PowerCurvePoint[];
  profile: PowerProfile | null;
  needsMoreData?: boolean;
  activityCount?: number;
  computing?: boolean;
};

export function PerformanceClient({ userFtp, userWeight }: PerformanceClientProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showWkg, setShowWkg] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retries = 0;

    async function load() {
      try {
        const res = await fetch("/api/power-curve");
        const json = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(json.error ?? "Failed to load power data");
          setIsLoading(false);
          return;
        }

        setData(json);
        setIsLoading(false);

        // If still computing, poll up to 5 times with increasing delay
        if (json.computing && retries < 5) {
          retries++;
          setTimeout(async () => {
            if (cancelled) return;
            const retry = await fetch("/api/power-curve");
            const retryJson = await retry.json();
            if (cancelled) return;
            if (retry.ok) {
              setData(retryJson);
              // Keep polling if still computing
              if (retryJson.computing && retries < 5) {
                retries++;
                setTimeout(load, 3000 * retries);
              }
            }
          }, 3000);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load power data");
          setIsLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/power-curve?refresh=1");
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading performance data...
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!data) return null;

  if (data.needsMoreData) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-3">
        <Activity className="h-10 w-10 mx-auto text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">More rides needed</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          You have {data.activityCount ?? 0} ride{(data.activityCount ?? 0) !== 1 ? "s" : ""} with
          power data. We need at least 5 to build a meaningful power curve. Keep riding and syncing
          your activities!
        </p>
      </div>
    );
  }

  if (data.computing) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Computing your power curve for the first time... This may take a minute.
      </div>
    );
  }

  const profile = data.profile;

  return (
    <div className="space-y-8">
      {/* Power Curve Chart */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Power Duration Curve</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            {userWeight && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWkg(!showWkg)}
              >
                {showWkg ? "Show Watts" : "Show W/kg"}
              </Button>
            )}
          </div>
        </div>
        <GlobalPowerCurveChart
          allTime={data.allTime}
          last42d={data.last42d}
          showWkg={showWkg}
          ftp={userFtp}
          weight={userWeight}
        />
      </div>

      {/* Power Profile */}
      {profile && (
        <div className="rounded-xl border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold">Rider Profile</h2>

          {/* Profile type + description */}
          <div className="space-y-2">
            <div className="text-3xl font-bold">{profile.type}</div>
            <p className="text-sm text-muted-foreground max-w-2xl">{profile.description}</p>
            {profile.estimatedFtp != null && (
              <p className="text-sm text-muted-foreground">
                Estimated FTP: <span className="font-semibold text-foreground">{profile.estimatedFtp}W</span>
                <span className="ml-1">(95% of 20min peak)</span>
              </p>
            )}
          </div>

          {/* Radar chart */}
          <PowerProfileRadar profile={profile} />

          {/* Weakness callout */}
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Biggest opportunity:{" "}
              {profile.weakness} power
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
