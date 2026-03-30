import type { SupabaseClient } from "@supabase/supabase-js";

export type StravaCredentials = { clientId: string; clientSecret: string };

/** Returns true when per-user Strava credentials mode is active. */
export function isUserCredentialsMode(): boolean {
  return process.env.NEXT_PUBLIC_STRAVA_USER_CREDENTIALS_MODE === "true";
}

/**
 * Resolves Strava OAuth app credentials for a user.
 * - When user credentials mode is on: reads from strava_app_credentials (throws if not found).
 * - Otherwise: reads from STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET env vars.
 */
export async function resolveStravaCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<StravaCredentials> {
  if (isUserCredentialsMode()) {
    const { data, error } = await supabase
      .from("strava_app_credentials")
      .select("client_id, client_secret")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      throw new Error(
        "Strava credentials not configured. Please enter your Strava Client ID and Client Secret."
      );
    }

    return { clientId: data.client_id, clientSecret: data.client_secret };
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Strava is not configured");
  }

  return { clientId, clientSecret };
}
