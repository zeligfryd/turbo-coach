import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signOAuthState } from "@/lib/strava/oauth-state";
import { resolveStravaCredentials } from "@/lib/strava/credentials";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const redirectUri = process.env.NEXT_PUBLIC_STRAVA_REDIRECT_URI;

    if (!redirectUri) {
      return NextResponse.json({ error: "Strava redirect URI is not configured" }, { status: 500 });
    }

    let clientId: string;
    try {
      const credentials = await resolveStravaCredentials(supabase, user.id);
      clientId = credentials.clientId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Strava is not configured";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const state = signOAuthState(user.id);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "read,activity:read_all",
      state,
    });

    return NextResponse.redirect(
      `https://www.strava.com/oauth/authorize?${params}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
