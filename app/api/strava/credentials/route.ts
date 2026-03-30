import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as { clientId?: unknown; clientSecret?: unknown };

    if (
      typeof body.clientId !== "string" ||
      typeof body.clientSecret !== "string" ||
      !body.clientId.trim() ||
      !body.clientSecret.trim()
    ) {
      return NextResponse.json({ error: "clientId and clientSecret are required" }, { status: 400 });
    }

    const { error } = await supabase.from("strava_app_credentials").upsert(
      {
        user_id: user.id,
        client_id: body.clientId.trim(),
        client_secret: body.clientSecret.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return NextResponse.json({ error: "Failed to save credentials" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
