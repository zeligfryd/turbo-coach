"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StravaConnectionRow } from "@/lib/strava/types";

const USER_CREDENTIALS_MODE =
  process.env.NEXT_PUBLIC_STRAVA_USER_CREDENTIALS_MODE === "true";

interface StravaConnectionProps {
  initialConnection: StravaConnectionRow | null;
}

export function StravaConnection({ initialConnection }: StravaConnectionProps) {
  const [connection, setConnection] = useState<StravaConnectionRow | null>(initialConnection);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Per-user credentials form state (only relevant when USER_CREDENTIALS_MODE is on)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    if (USER_CREDENTIALS_MODE) {
      setClientId(localStorage.getItem("strava_client_id") ?? "");
      setClientSecret(localStorage.getItem("strava_client_secret") ?? "");
    }
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    if (USER_CREDENTIALS_MODE) {
      if (!clientId.trim() || !clientSecret.trim()) {
        setError("Please enter your Strava Client ID and Client Secret.");
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/strava/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Failed to save credentials");
          setIsLoading(false);
          return;
        }

        localStorage.setItem("strava_client_id", clientId.trim());
        localStorage.setItem("strava_client_secret", clientSecret.trim());
      } catch {
        setError("Network error");
        setIsLoading(false);
        return;
      }
    }

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

  const handleSync = async (mode: "incremental" | "full" = "incremental") => {
    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
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

            {USER_CREDENTIALS_MODE && (
              <div className="flex flex-col gap-3 rounded-md border p-4">
                <p className="text-sm text-muted-foreground">
                  Enter your Strava API application credentials.{" "}
                  <a
                    href="https://www.strava.com/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Create a Strava API app
                  </a>{" "}
                  to obtain them.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="strava-client-id">Client ID</Label>
                  <Input
                    id="strava-client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="12345"
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="strava-client-secret">Client Secret</Label>
                  <Input
                    id="strava-client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="••••••••••••••••"
                    autoComplete="off"
                  />
                </div>
              </div>
            )}

            <Button
              onClick={handleConnect}
              disabled={isLoading}
              className="w-full bg-[#FC4C02] hover:bg-[#e04400] text-white"
            >
              {isLoading ? "Connecting..." : "Connect with Strava"}
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
            <Button onClick={() => handleSync("incremental")} disabled={isSyncing || isLoading} className="flex-1">
              {isSyncing ? "Syncing..." : "Sync Recent"}
            </Button>
            <Button variant="outline" onClick={() => handleSync("full")} disabled={isSyncing || isLoading}>
              Full Sync
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
