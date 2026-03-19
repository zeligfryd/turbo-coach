import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createIcuClient } from "@/lib/intervals/client";

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

    const body = (await request.json()) as { apiKey?: string; athleteId?: string };
    const { apiKey, athleteId } = body;

    if (!apiKey || !athleteId) {
      return NextResponse.json(
        { error: "API key and athlete ID are required" },
        { status: 400 }
      );
    }

    // Validate credentials against intervals.icu
    const client = createIcuClient(apiKey, athleteId);
    const validation = await client.validateConnection();

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error ?? "Invalid credentials" },
        { status: 400 }
      );
    }

    // Upsert connection
    const { error } = await supabase.from("icu_connections").upsert(
      {
        user_id: user.id,
        api_key: apiKey,
        athlete_id: athleteId,
        sync_status: "idle",
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
