import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyOAuthState } from "@/lib/strava/oauth-state";
import type { StravaTokenResponse } from "@/lib/strava/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // Strava sends error param if user denied access
  if (errorParam) {
    return NextResponse.redirect(new URL("/profile?strava=denied", request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/profile?strava=error", request.url));
  }

  // Verify HMAC-signed state
  const userId = verifyOAuthState(state);
  if (!userId) {
    return NextResponse.redirect(new URL("/profile?strava=error", request.url));
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        new URL("/profile?strava=error", request.url)
      );
    }

    const tokenData = (await tokenRes.json()) as StravaTokenResponse;

    // Store connection using the server supabase client
    const supabase = await createClient();
    const { error } = await supabase.from("strava_connections").upsert(
      {
        user_id: userId,
        strava_athlete_id: tokenData.athlete.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
        scope: "read,activity:read_all",
        sync_status: "idle",
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return NextResponse.redirect(
        new URL("/profile?strava=error", request.url)
      );
    }

    return NextResponse.redirect(
      new URL("/profile?strava=connected", request.url)
    );
  } catch {
    return NextResponse.redirect(new URL("/profile?strava=error", request.url));
  }
}
