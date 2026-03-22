import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklySummary } from "@/lib/ai/insights";

/**
 * POST /api/coach/weekly-summary
 *
 * Generates weekly summaries for all users with weekly_summary_enabled = true.
 * Intended to be called by a cron job (e.g. Vercel Cron) once per week.
 * Protected by CRON_SECRET header.
 *
 * Can also be called manually for a specific user by an authenticated request.
 */
export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");

    // Cron mode: process all opted-in users
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      const supabase = await createClient();

      const { data: users, error } = await supabase
        .from("users")
        .select("id")
        .eq("weekly_summary_enabled", true);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      let generated = 0;
      for (const user of (users ?? [])) {
        try {
          const summary = await generateWeeklySummary(user.id);
          if (summary) {
            await supabase.from("coach_insights").insert({
              user_id: user.id,
              type: "weekly_summary",
              content: summary,
              metadata: { generated_at: new Date().toISOString() },
            });
            generated++;
          }
        } catch (err) {
          console.error(`[WeeklySummary] Failed for user ${user.id}:`, err);
        }
      }

      return NextResponse.json({ success: true, users_processed: (users ?? []).length, summaries_generated: generated });
    }

    // Manual mode: generate for authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const summary = await generateWeeklySummary(user.id);
    if (!summary) {
      return NextResponse.json({ message: "No activities this week, skipping summary." });
    }

    await supabase.from("coach_insights").insert({
      user_id: user.id,
      type: "weekly_summary",
      content: summary,
      metadata: { generated_at: new Date().toISOString(), manual: true },
    });

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
