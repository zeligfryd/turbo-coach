"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StravaConnectionRow } from "@/lib/strava/types";

interface StravaConnectionProps {
  initialConnection: StravaConnectionRow | null;
}

export function StravaConnection({ initialConnection }: StravaConnectionProps) {
  const [connection, setConnection] = useState<StravaConnectionRow | null>(initialConnection);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleConnect = () => {
    window.location.href = "/api/strava/authorize";
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/strava/disconnect", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to disconnect");
        return;
      }

      setConnection(null);
      setSuccess("Disconnected from Strava");
    } catch {
      setError("Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        if (connection) {
          setConnection({ ...connection, sync_status: "error", sync_error: data.error });
        }
        return;
      }

      setSuccess(`Synced ${data.activitiesSynced} activities from Strava`);
      if (connection) {
        setConnection({
          ...connection,
          last_synced_at: new Date().toISOString(),
          sync_status: "idle",
          sync_error: null,
        });
      }
    } catch {
      setError("Network error");
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSynced = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString();
  };

  if (!connection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Strava</CardTitle>
          <CardDescription>
            Connect your Strava account to sync your activity data (rides, runs, etc.) into your calendar and AI coach.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <Button onClick={handleConnect} className="w-full bg-[#FC4C02] hover:bg-[#e04400] text-white">
              Connect with Strava
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Strava</CardTitle>
        <CardDescription>
          Connected as athlete {connection.strava_athlete_id}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-[#FC4C02]" />
            <span className="text-muted-foreground">Connected</span>
            <span className="text-muted-foreground ml-auto">
              Last synced: {formatLastSynced(connection.last_synced_at)}
            </span>
          </div>

          {connection.sync_status === "error" && connection.sync_error && (
            <p className="text-sm text-red-500">Last sync error: {connection.sync_error}</p>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <div className="flex gap-3">
            <Button onClick={handleSync} disabled={isSyncing || isLoading} className="flex-1">
              {isSyncing ? "Syncing..." : "Sync Activities"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={isSyncing || isLoading}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
