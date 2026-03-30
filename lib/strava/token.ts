import type { SupabaseClient } from "@supabase/supabase-js";
import type { StravaConnectionRow, StravaTokenResponse } from "./types";
import { isUserCredentialsMode, resolveStravaCredentials, type StravaCredentials } from "./credentials";

export async function refreshStravaToken(
  refreshToken: string,
  credentials?: StravaCredentials
): Promise<StravaTokenResponse> {
  const clientId = credentials?.clientId ?? process.env.STRAVA_CLIENT_ID;
  const clientSecret = credentials?.clientSecret ?? process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Strava credentials not configured");
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }

  return (await res.json()) as StravaTokenResponse;
}

export async function getValidStravaToken(
  supabase: SupabaseClient,
  userId: string
): Promise<{ accessToken: string; connection: StravaConnectionRow }> {
  const { data, error } = await supabase
    .from("strava_connections")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("No Strava connection found");
  }

  const connection = data as StravaConnectionRow;
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer

  if (Date.now() < expiresAt - bufferMs) {
    return { accessToken: connection.access_token, connection };
  }

  // Token expired — refresh, using per-user credentials if the mode is active
  const credentials = isUserCredentialsMode()
    ? await resolveStravaCredentials(supabase, userId)
    : undefined;

  const refreshed = await refreshStravaToken(connection.refresh_token, credentials);

  await supabase
    .from("strava_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return {
    accessToken: refreshed.access_token,
    connection: {
      ...connection,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    },
  };
}
