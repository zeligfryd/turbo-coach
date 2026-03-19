"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IcuConnectionRow } from "@/lib/intervals/types";

interface IntervalsConnectionProps {
  initialConnection: IcuConnectionRow | null;
}

export function IntervalsConnection({ initialConnection }: IntervalsConnectionProps) {
  const [connection, setConnection] = useState<IcuConnectionRow | null>(initialConnection);
  const [apiKey, setApiKey] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState<number | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/intervals/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, athleteId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to connect");
        return;
      }

      setConnection({
        id: "",
        user_id: "",
        api_key: apiKey,
        athlete_id: athleteId,
        last_synced_at: null,
        sync_status: "idle",
        sync_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setApiKey("");
      setAthleteId("");
      setSuccess("Connected to intervals.icu!");
    } catch {
      setError("Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/intervals/disconnect", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to disconnect");
        return;
      }

      setConnection(null);
      setSyncCount(null);
      setSuccess("Disconnected from intervals.icu");
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
    setSyncCount(null);

    try {
      const res = await fetch("/api/intervals/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        if (connection) {
          setConnection({ ...connection, sync_status: "error", sync_error: data.error });
        }
        return;
      }

      setSyncCount(data.daysSynced);
      setSuccess(`Synced ${data.daysSynced} days of wellness data`);
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
          <CardTitle className="text-2xl">Intervals.icu</CardTitle>
          <CardDescription>
            Connect your intervals.icu account to sync fitness and fatigue metrics (CTL, ATL, ramp rate).
            Find your API key in intervals.icu &rarr; Settings &rarr; Developer Settings.
            Your athlete ID is in the URL when viewing your profile (e.g., i12345).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConnect}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="icu-athlete-id">Athlete ID</Label>
                <Input
                  id="icu-athlete-id"
                  type="text"
                  placeholder="e.g., i12345"
                  value={athleteId}
                  onChange={(e) => setAthleteId(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="icu-api-key">API Key</Label>
                <Input
                  id="icu-api-key"
                  type="password"
                  placeholder="Paste your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Intervals.icu</CardTitle>
        <CardDescription>
          Connected as athlete {connection.athlete_id}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
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
          {syncCount !== null && !error && (
            <p className="text-sm text-muted-foreground">{syncCount} days of wellness synced</p>
          )}

          <div className="flex gap-3">
            <Button onClick={handleSync} disabled={isSyncing || isLoading} className="flex-1">
              {isSyncing ? "Syncing..." : "Sync Wellness"}
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
