import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklySummary } from "@/lib/ai/insights";
import {
  getOrCreateInsightsConversation,
  appendInsightMessage,
} from "@/lib/coach/insights-conversation";

/**
 * GET /api/coach/weekly-summary — Vercel Cron handler
 * POST /api/coach/weekly-summary — manual trigger for authenticated user
 *
 * Cron mode (GET with CRON_SECRET): processes all users with weekly_summary_enabled = true.
 * Manual mode (POST): generates for the authenticated user.
 */

async function handleCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      const result = await generateWeeklySummary(user.id);
      if (result) {
        const convId = await getOrCreateInsightsConversation(supabase, user.id);
        await appendInsightMessage(supabase, convId, user.id, result.text, "weekly_summary", {
          generated_at: new Date().toISOString(),
          week_start: result.weekStart,
          week_end: result.weekEnd,
        });
        generated++;
      }
    } catch (err) {
      console.error(`[WeeklySummary] Failed for user ${user.id}:`, err);
    }
  }

  return NextResponse.json({ success: true, users_processed: (users ?? []).length, summaries_generated: generated });
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const result = await generateWeeklySummary(user.id);
    if (!result) {
      return NextResponse.json({ message: "No activities this week, skipping summary." });
    }

    const convId = await getOrCreateInsightsConversation(supabase, user.id);
    await appendInsightMessage(supabase, convId, user.id, result.text, "weekly_summary", {
      generated_at: new Date().toISOString(),
      manual: true,
      week_start: result.weekStart,
      week_end: result.weekEnd,
    });

    return NextResponse.json({ success: true, summary: result.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
